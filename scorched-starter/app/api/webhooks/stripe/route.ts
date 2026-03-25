// app/api/webhooks/stripe/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("STRIPE_WEBHOOK_SIG_ERROR", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ ok: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return Response.json({ ok: true });
  }

  const { name, email, phone, date, time_slot, party_size } = session.metadata ?? {};

  if (!name || !email || !date || !time_slot || !party_size) {
    console.error("STRIPE_WEBHOOK_MISSING_METADATA", session.metadata);
    return Response.json({ error: "Missing metadata" }, { status: 400 });
  }

  // Insert confirmed booking
  const { error: dbError } = await getSupabase()
    .from("bookings")
    .insert({
      name,
      email,
      phone: phone || null,
      date,
      time_slot,
      party_size: Number(party_size),
      amount_paid: session.amount_total ?? 0,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripe_session_id: session.id,
      status: "confirmed",
    });

  if (dbError) {
    console.error("BOOKING_DB_ERROR", dbError);
    return Response.json({ error: "Failed to save booking" }, { status: 500 });
  }

  // Send confirmation email
  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const total = ((session.amount_total ?? 0) / 100).toFixed(2);
  const partySizeNum = Number(party_size);

  await resend.emails.send({
    from: "Scorched Studio <bookings@scorchedstudio.com>",
    to: email,
    subject: "Your Scorched Studio Booking — You're all set!",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">You're booked, ${name.split(" ")[0]}!</h1>
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
            <strong>Reminder:</strong> Each person in your group needs to sign a waiver before their first visit.
            You can sign at <a href="https://scorchedstudio.com/waiver" style="color: #884A20;">scorchedstudio.com/waiver</a> or in-studio.
          </p>
        </div>

        <p style="color: #555; font-size: 14px;">
          Questions? Email us at
          <a href="mailto:contact@scorchedstudio.com" style="color: #884A20;">contact@scorchedstudio.com</a>
          or call <a href="tel:+18013619066" style="color: #884A20;">(801) 361-9066</a>.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 12px;">
          Please do not reply directly to this email — it is not monitored.
        </p>
        <p style="color: #555; font-size: 14px; margin-top: 24px;">
          See you soon!<br/>
          <strong>— The Scorched Studio Team</strong>
        </p>
      </div>
    `,
  });

  return Response.json({ ok: true });
}
