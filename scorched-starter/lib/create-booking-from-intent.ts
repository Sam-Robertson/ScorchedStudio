// lib/create-booking-from-intent.ts
// Shared helper: verify a PaymentIntent, insert a confirmed booking, send email.
// Idempotent — safe to call from both the client-facing confirm route and the webhook.

import Stripe from "stripe";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";

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
    })
    .select()
    .single();

  if (dbError) {
    console.error("CREATE_BOOKING_DB_ERROR", dbError);
    return { ok: false, error: "Failed to save booking.", status: 500 };
  }

  // 4. Send confirmation email
  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const total = (intent.amount / 100).toFixed(2);
  const partySizeNum = Number(party_size);
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: "Scorched Studio <bookings@scorchedstudio.com>",
    to: email,
    subject: "Your Scorched Studio Booking — You&apos;re all set!",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">You're booked, ${firstName}!</h1>
        <p style="color: #555; margin-bottom: 24px;">
          We can't wait to see you at Scorched Studio. Here are your booking details:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px; width: 40%;">Date</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px;">Time</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${time_slot}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px;">Party size</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${partySizeNum} ${partySizeNum === 1 ? "person" : "people"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px;">Total paid</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">$${total}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #888; font-size: 13px;">Location</td>
            <td style="padding: 8px 0; font-size: 13px;">218 E University Pkwy, Orem, UT 84058</td>
          </tr>
        </table>
        <div style="background: #F7F6F3; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="font-size: 13px; color: #555; margin: 0;">
            <strong>Reminder:</strong> Each person needs to sign a waiver before their first visit.
            Sign at <a href="https://scorchedstudio.com/waiver" style="color: #884A20;">scorchedstudio.com/waiver</a> or in-studio.
          </p>
        </div>
        <p style="color: #555; font-size: 14px;">
          Need to make changes? Visit
          <a href="https://scorchedstudio.com/book?tab=manage" style="color: #884A20;">scorchedstudio.com/book</a>.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 12px;">Please do not reply to this email — it is not monitored.</p>
        <p style="color: #555; font-size: 14px; margin-top: 24px;">
          See you soon!<br/><strong>— The Scorched Studio Team</strong>
        </p>
      </div>
    `,
  }).catch((e) => console.error("BOOKING_EMAIL_ERROR", e));

  return { ok: true, booking_id: booking.id };
}
