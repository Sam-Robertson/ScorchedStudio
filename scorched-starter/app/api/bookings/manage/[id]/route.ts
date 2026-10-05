// app/api/bookings/manage/[id]/route.ts
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";
import { isBookingEditable, isUnpaidReservation, refundDueCents } from "@/lib/booking-rules";
import { refundAllOfBooking, refundPartOfBooking } from "@/lib/booking-payments";
import { canManageBooking, manageBookingUrl } from "@/lib/booking-link";
import { BOOKING_EMAIL_FROM, bookingUpdatedEmail } from "@/lib/booking-emails";
import { getLocationByKey } from "@/lib/locations";
import { todayInDenverYmd } from "@/lib/timezone";

const resend = new Resend(process.env.RESEND_API_KEY);

const NOT_VERIFIED =
  "We couldn't verify this booking. Open the link in your confirmation email, or look it up with the email you booked with.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = req.nextUrl.searchParams.get("email");
  const token = req.nextUrl.searchParams.get("t");

  if (!email && !token) {
    return Response.json({ error: NOT_VERIFIED }, { status: 400 });
  }

  const { data: booking, error } = await getSupabase()
    .from("bookings")
    .select("id, name, email, date, time_slot, party_size, status, payment_method, amount_paid, location")
    .eq("id", id)
    .single();

  if (error || !booking) {
    return Response.json({ error: "Booking not found." }, { status: 404 });
  }

  if (!canManageBooking(booking, { email, token })) {
    return Response.json({ error: NOT_VERIFIED }, { status: 403 });
  }

  if (booking.status === "cancelled") {
    return Response.json({ error: "This booking has already been cancelled." }, { status: 410 });
  }

  const editable = isBookingEditable(booking.date, booking.time_slot);

  return Response.json({ booking, editable });
}

// Either the booking email or the signed token from the emailed link.
const proof = {
  email: z.string().email().optional(),
  token: z.string().min(1).optional(),
};

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    ...proof,
  }),
  z.object({
    action: z.literal("update"),
    ...proof,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_slot: z.string().min(1),
    party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
    // Only honoured on a booking nothing has been collected for. Omitted
    // leaves the payment method alone.
    payment_method: z.enum(["gift_card"]).nullable().optional(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await req.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: booking, error: fetchError } = await getSupabase()
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }

  if (!canManageBooking(booking, parsed.data)) {
    return Response.json({ error: NOT_VERIFIED }, { status: 403 });
  }

  if (booking.status === "cancelled") {
    return Response.json({ error: "This booking has already been cancelled." }, { status: 410 });
  }

  if (!isBookingEditable(booking.date, booking.time_slot)) {
    return Response.json(
      { error: "This booking can no longer be modified. The session has already started or passed." },
      { status: 400 }
    );
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  if (parsed.data.action === "cancel") {
    // Issue Stripe refund if the booking was paid via card
    let refunded = false;
    if (booking.stripe_payment_intent_id && booking.amount_paid > 0) {
      try {
        await refundAllOfBooking(booking);
        refunded = true;
      } catch (e) {
        console.error("REFUND_ERROR", e);
        return Response.json({ error: "Failed to issue refund. Please contact support." }, { status: 500 });
      }
    }

    const { error } = await getSupabase()
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) {
      console.error("CANCEL_ERROR", error);
      return Response.json({ error: "Failed to cancel booking." }, { status: 500 });
    }

    // Send cancellation email
    if (booking.email) {
      const formattedDate = new Date(booking.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
      const firstName = booking.name.split(" ")[0];
      const refundNote = refunded
        ? `<p style="color: #555; font-size: 14px;">A full refund of <strong>$${(booking.amount_paid / 100).toFixed(2)}</strong> has been issued to your original payment method. It typically appears within 5–10 business days.</p>`
        : "";

      await resend.emails.send({
        from: "Scorched Studio <bookings@scorchedstudio.com>",
        to: booking.email,
        subject: "Your Scorched Studio Booking Has Been Cancelled",
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
            <h1 style="font-size: 22px; margin-bottom: 8px;">Booking cancelled, ${firstName}</h1>
            <p style="color: #555; margin-bottom: 16px;">Your reservation for <strong>${formattedDate}</strong> at <strong>${booking.time_slot}</strong> has been cancelled.</p>
            ${refundNote}
            <p style="color: #555; font-size: 14px; margin-top: 24px;">
              Want to book again? Visit <a href="https://scorchedstudio.com/book" style="color: #884A20;">scorchedstudio.com/book</a>.
            </p>
            <p style="color: #aaa; font-size: 12px; margin-top: 12px;">Please do not reply to this email. It is not monitored.</p>
            <p style="color: #555; font-size: 14px; margin-top: 24px;">The Scorched Studio Team</p>
          </div>
        `,
      }).catch((e) => console.error("CANCEL_EMAIL_ERROR", e));
    }

    return Response.json({ ok: true, refunded, amount_refunded: refunded ? booking.amount_paid : 0 });
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  const { date, time_slot, party_size } = parsed.data;

  const today = todayInDenverYmd();
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  const location = (booking.location as "orem" | "slc") ?? "orem";
  const locationRecord = await getLocationByKey(location);
  const capacity = locationRecord?.capacity ?? MAX_CAPACITY;

  const validSlots = await getSlotsForDate(date, location);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Check capacity at new slot, excluding this booking
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("party_size")
    .eq("date", date)
    .eq("time_slot", time_slot)
    .eq("location", location)
    .eq("status", "confirmed")
    .neq("id", id);

  const totalBooked = (existing ?? []).reduce((sum, r) => sum + r.party_size, 0);
  const remaining = capacity - totalBooked;

  if (party_size > remaining) {
    const available = Math.max(0, remaining);
    return Response.json(
      {
        error:
          available <= 0
            ? "This time slot is fully booked. Please choose another."
            : `Only ${available} spot${available === 1 ? "" : "s"} available for this slot.`,
      },
      { status: 409 }
    );
  }

  // Gift card is a note about how they will pay in studio, so it only means
  // something while nothing has been collected. A paid, Get Out Pass, or
  // complimentary booking keeps its payment method whatever the request says.
  const payment_method =
    parsed.data.payment_method !== undefined && isUnpaidReservation(booking)
      ? parsed.data.payment_method
      : booking.payment_method;

  // A card-paid party that got smaller gets the difference back. Refunded
  // before the booking is changed, like a cancellation: if the refund fails
  // nothing has moved, and the customer can simply try again.
  const refundedCents = booking.stripe_payment_intent_id ? refundDueCents(booking, party_size) : 0;
  if (refundedCents > 0) {
    try {
      await refundPartOfBooking(
        booking,
        refundedCents,
        `booking-shrink-${id}-${booking.amount_paid}-${party_size}`
      );
    } catch (e) {
      console.error("PARTY_REFUND_ERROR", e);
      return Response.json(
        { error: "We couldn't refund the difference, so nothing was changed. Please try again or contact us." },
        { status: 500 }
      );
    }
  }
  const amount_paid = booking.amount_paid - refundedCents;

  const { error: updateError } = await getSupabase()
    .from("bookings")
    .update({ date, time_slot, party_size, payment_method, amount_paid })
    .eq("id", id);

  if (updateError) {
    // If a refund went out above, this booking now shows more paid than it
    // holds. The idempotency key means a retry will not refund twice.
    console.error("UPDATE_BOOKING_ERROR", { refundedCents, updateError });
    return Response.json({ error: "Failed to update booking." }, { status: 500 });
  }

  // Send update confirmation email
  const message = bookingUpdatedEmail({
    name: booking.name,
    date,
    timeSlot: time_slot,
    partySize: party_size,
    locationLine: locationRecord?.address ?? locationRecord?.name ?? "Scorched Studio",
    manageUrl: manageBookingUrl(id),
    amountPaidCents: amount_paid,
    paymentMethod: payment_method,
    refundedCents,
  });

  await resend.emails.send({
    from: BOOKING_EMAIL_FROM,
    to: booking.email,
    ...message,
  }).catch((e) => console.error("UPDATE_EMAIL_ERROR", e));

  return Response.json({ ok: true, payment_method, amount_paid, refunded_cents: refundedCents });
}
