// lib/create-booking-from-intent.ts
// Shared helper: verify a PaymentIntent, insert a confirmed booking, send email.
// Idempotent — safe to call from both the client-facing confirm route and the webhook.

import Stripe from "stripe";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import { getLocationByKey } from "@/lib/locations";
import { manageBookingUrl } from "@/lib/booking-link";
import { BOOKING_EMAIL_FROM, paidBookingEmail } from "@/lib/booking-emails";
import { amountDueCents } from "@/lib/booking-rules";
import { hasExtraPayment, recordExtraPayment } from "@/lib/booking-payments";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export type CreateBookingResult =
  | { ok: true; booking_id: string }
  | { ok: false; error: string; status: number };

export async function createBookingFromIntent(
  paymentIntentId: string
): Promise<CreateBookingResult> {
  // 1. Verify payment with Stripe
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { ok: false, error: "Could not retrieve payment.", status: 400 };
  }

  if (intent.status !== "succeeded") {
    return { ok: false, error: "Payment not completed.", status: 400 };
  }

  // A payment for a reservation that already exists (started from the manage
  // page) carries its booking id. Apply it there rather than inserting a second
  // booking for the same visit.
  if (intent.metadata?.booking_id) {
    return applyPaymentToBooking(intent, intent.metadata.booking_id);
  }

  // 2. Idempotency — return existing booking if already created
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existing) {
    return { ok: true, booking_id: existing.id };
  }

  // 3. Insert booking
  const { name, email, phone, date, time_slot, party_size, referral_source, referral_other } = intent.metadata ?? {};
  const location = intent.metadata?.location === "slc" ? "slc" : "orem";

  if (!name || !email || !date || !time_slot || !party_size) {
    console.error("CREATE_BOOKING_MISSING_METADATA", intent.metadata);
    return { ok: false, error: "Missing booking metadata.", status: 400 };
  }

  const { data: booking, error: dbError } = await getSupabase()
    .from("bookings")
    .insert({
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      date,
      time_slot,
      party_size: Number(party_size),
      amount_paid: intent.amount,
      stripe_payment_intent_id: paymentIntentId,
      status: "confirmed",
      payment_method: "stripe",
      referral_source: referral_source || null,
      referral_other: referral_other || null,
      location,
    })
    .select()
    .single();

  if (dbError) {
    console.error("CREATE_BOOKING_DB_ERROR", dbError);
    return { ok: false, error: "Failed to save booking.", status: 500 };
  }

  // 4. Send confirmation email
  const locationRecord = await getLocationByKey(location);
  const message = paidBookingEmail({
    kind: "new_booking",
    name,
    date,
    timeSlot: time_slot,
    partySize: Number(party_size),
    locationLine: locationRecord?.address ?? locationRecord?.name ?? "Scorched Studio",
    manageUrl: manageBookingUrl(booking.id),
    amountPaidCents: intent.amount,
  });

  await resend.emails.send({
    from: BOOKING_EMAIL_FROM,
    to: email,
    ...message,
  }).catch((e) => console.error("BOOKING_EMAIL_ERROR", e));

  return { ok: true, booking_id: booking.id };
}

// Applies a payment to a booking that already exists: the whole fee on a
// reservation made without paying, or the difference when a paid party grew.
async function applyPaymentToBooking(
  intent: Stripe.PaymentIntent,
  bookingId: string
): Promise<CreateBookingResult> {
  const sb = getSupabase();

  // First payment on the booking. Conditional on it still being unpaid: the
  // confirm route and the webhook both call this for the same payment, and
  // whichever loses the race updates nothing, so the payment is applied and
  // the receipt sent once.
  const { data: firstPayment, error } = await sb
    .from("bookings")
    .update({
      amount_paid: intent.amount,
      stripe_payment_intent_id: intent.id,
      payment_method: "stripe",
    })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .is("stripe_payment_intent_id", null)
    .select()
    .maybeSingle();

  if (error) {
    console.error("APPLY_BOOKING_PAYMENT_DB_ERROR", error);
    return { ok: false, error: "Payment received but your booking could not be updated. Please contact us.", status: 500 };
  }

  if (firstPayment) {
    await sendPaymentEmail(firstPayment, intent.amount);
    return { ok: true, booking_id: bookingId };
  }

  const { data: current } = await sb
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  // The other caller already applied this same payment.
  if (current?.stripe_payment_intent_id === intent.id || (await hasExtraPayment(intent.id))) {
    return { ok: true, booking_id: bookingId };
  }

  // A later payment on a card-paid booking: the difference for extra guests.
  // Only accepted while it does not push the total past what the party costs,
  // which is what catches the same balance being paid twice from two tabs.
  const owed = current?.status === "confirmed" ? amountDueCents(current) : 0;
  if (current && intent.amount <= owed) {
    const result = await recordExtraPayment(bookingId, intent);
    if (result === "already_applied") return { ok: true, booking_id: bookingId };
    if (result === "applied") {
      await sendPaymentEmail(current, current.amount_paid + intent.amount);
      return { ok: true, booking_id: bookingId };
    }
  }

  // The other caller may have recorded this payment between the two checks
  // above, which would make the booking look fully paid to this one.
  if (await hasExtraPayment(intent.id)) {
    return { ok: true, booking_id: bookingId };
  }

  // The booking was cancelled, is already paid in full, or the payment could
  // not be recorded. There is nothing for the money to pay for, so it goes
  // back. The idempotency key makes the second caller's refund a no-op.
  console.error("BOOKING_PAYMENT_NOT_APPLICABLE", { bookingId, paymentIntentId: intent.id });
  try {
    await stripe.refunds.create(
      { payment_intent: intent.id },
      { idempotencyKey: `booking-payment-refund-${intent.id}` }
    );
  } catch (e) {
    console.error("BOOKING_PAYMENT_REFUND_ERROR", e);
    return { ok: false, error: "Payment received but it could not be applied to your booking. Please contact us.", status: 500 };
  }
  return { ok: false, error: "This booking was already paid or cancelled, so this payment has been refunded.", status: 409 };
}

async function sendPaymentEmail(
  booking: { id: string; name: string; email: string; date: string; time_slot: string; party_size: number; location: string | null },
  totalPaidCents: number
): Promise<void> {
  const locationRecord = await getLocationByKey(booking.location ?? "orem");
  const message = paidBookingEmail({
    kind: "payment_for_existing",
    name: booking.name,
    date: booking.date,
    timeSlot: booking.time_slot,
    partySize: booking.party_size,
    locationLine: locationRecord?.address ?? locationRecord?.name ?? "Scorched Studio",
    manageUrl: manageBookingUrl(booking.id),
    amountPaidCents: totalPaidCents,
  });

  await resend.emails.send({
    from: BOOKING_EMAIL_FROM,
    to: booking.email,
    ...message,
  }).catch((e) => console.error("BOOKING_PAYMENT_EMAIL_ERROR", e));
}
