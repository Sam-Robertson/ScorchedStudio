// app/api/bookings/reserve/route.ts
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";
import { getSupabase } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().min(1),
  party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  payment_method: z.enum(["gift_card", "get_out_pass"]).nullable().optional(),
  referral_source: z.string().optional(),
  referral_other: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { date, time_slot, party_size, name, email, phone, payment_method, referral_source, referral_other } = parsed.data;

  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  const validSlots = getSlotsForDate(date);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Check capacity
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("party_size")
    .eq("date", date)
    .eq("time_slot", time_slot)
    .eq("status", "confirmed");

  const totalBooked = (existing ?? []).reduce((sum, r) => sum + r.party_size, 0);
  const remaining = MAX_CAPACITY - totalBooked;

  if (remaining <= 0) {
    return Response.json(
      { error: "This time slot is fully booked. Please choose another." },
      { status: 409 }
    );
  }
  if (party_size > remaining) {
    return Response.json(
      {
        error: `Only ${remaining} spot${remaining === 1 ? "" : "s"} remaining. Please reduce your party size.`,
      },
      { status: 409 }
    );
  }

  const { data: booking, error: dbError } = await getSupabase()
    .from("bookings")
    .insert({
      name,
      email,
      phone: phone || null,
      date,
      time_slot,
      party_size,
      amount_paid: 0,
      stripe_payment_intent_id: null,
      stripe_session_id: null,
      status: "confirmed",
      payment_method: payment_method ?? null,
      referral_source: referral_source || null,
      referral_other: referral_other || null,
    })
    .select("id")
    .single();

  if (dbError || !booking) {
    console.error("RESERVE_DB_ERROR", dbError);
    return Response.json({ error: "Failed to save reservation" }, { status: 500 });
  }

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const paymentNote =
    payment_method === "gift_card"
      ? `<div style="background: #FEF9C3; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
           <p style="font-size: 13px; color: #713F12; margin: 0;">
             <strong>Gift card reminder:</strong> Please bring your gift card to pay the $15 per-person studio fee in-studio when you arrive.
           </p>
         </div>`
      : payment_method === "get_out_pass"
      ? `<div style="background: #F0FDF4; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
           <p style="font-size: 13px; color: #14532D; margin: 0;">
             <strong>Get Out Pass:</strong> Bring your pass when you arrive. No entry fee needed!
           </p>
         </div>`
      : "";

  await resend.emails.send({
    from: "Scorched Studio <bookings@scorchedstudio.com>",
    to: email,
    subject: "Your Scorched Studio Reservation — You're all set!",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">You're reserved, ${name.split(" ")[0]}!</h1>
        <p style="color: #555; margin-bottom: 24px;">
          Your spot is held at Scorched Studio. Here are your reservation details:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
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
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${party_size} ${party_size === 1 ? "person" : "people"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #888; font-size: 13px;">Location</td>
            <td style="padding: 8px 0; font-size: 13px;">218 E University Pkwy, Orem, UT 84058</td>
          </tr>
        </table>

        ${paymentNote}

        <div style="background: #F7F6F3; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
          <p style="font-size: 13px; color: #555; margin: 0;">
            <strong>Reminder:</strong> Each person needs to sign a waiver before their first visit.
            Sign at <a href="https://scorchedstudio.com/waiver" style="color: #884A20;">scorchedstudio.com/waiver</a> or in-studio.
          </p>
        </div>

        <p style="color: #555; font-size: 14px;">
          Need to reschedule or cancel?
          <a href="https://scorchedstudio.com/book/manage?booking_id=${booking.id}" style="color: #884A20;">Manage your booking →</a>
        </p>
        <p style="color: #555; font-size: 14px; margin-top: 12px;">
          Questions? Email <a href="mailto:contact@scorchedstudio.com" style="color: #884A20;">contact@scorchedstudio.com</a>
          or call <a href="tel:+18013619066" style="color: #884A20;">(801) 361-9066</a>.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 12px;">Please do not reply to this email — it is not monitored.</p>
        <p style="color: #555; font-size: 14px; margin-top: 24px;">
          See you soon!<br/><strong>— The Scorched Studio Team</strong>
        </p>
      </div>
    `,
  });

  return Response.json({ booking_id: booking.id });
}
