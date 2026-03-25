// app/api/bookings/manage/[id]/route.ts
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";

const resend = new Resend(process.env.RESEND_API_KEY);

// Studio is in Mountain Time (UTC-7 standard, UTC-6 DST).
// Returns true if the booking appointment hasn't started yet.
function isEditable(bookingDate: string, timeSlot: string): boolean {
  const now = new Date();
  const todayUTC = now.toISOString().split("T")[0];

  if (bookingDate > todayUTC) return true;
  if (bookingDate < todayUTC) return false;

  // Same calendar date — compare against slot start time in MT (UTC-7)
  const match = timeSlot.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return false;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  // MT = UTC-7; shift slot time to UTC
  const slotUTC = new Date(`${bookingDate}T00:00:00Z`);
  slotUTC.setUTCHours(hours + 7, minutes, 0, 0);

  return now < slotUTC;
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    email: z.string().email(),
  }),
  z.object({
    action: z.literal("update"),
    email: z.string().email(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_slot: z.string().min(1),
    party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
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

  if (booking.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return Response.json({ error: "Email does not match this booking." }, { status: 403 });
  }

  if (!isEditable(booking.date, booking.time_slot)) {
    return Response.json(
      { error: "This booking can no longer be modified — the session has already started or passed." },
      { status: 400 }
    );
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  if (parsed.data.action === "cancel") {
    const { error } = await getSupabase()
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) {
      console.error("CANCEL_ERROR", error);
      return Response.json({ error: "Failed to cancel booking." }, { status: 500 });
    }

    return Response.json({ ok: true });
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  const { date, time_slot, party_size } = parsed.data;

  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  const validSlots = getSlotsForDate(date);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Check capacity at new slot, excluding this booking
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("party_size")
    .eq("date", date)
    .eq("time_slot", time_slot)
    .eq("status", "confirmed")
    .neq("id", id);

  const totalBooked = (existing ?? []).reduce((sum, r) => sum + r.party_size, 0);
  const remaining = MAX_CAPACITY - totalBooked;

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

  const { error: updateError } = await getSupabase()
    .from("bookings")
    .update({ date, time_slot, party_size })
    .eq("id", id);

  if (updateError) {
    console.error("UPDATE_BOOKING_ERROR", updateError);
    return Response.json({ error: "Failed to update booking." }, { status: 500 });
  }

  // Send update confirmation email
  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  await resend.emails.send({
    from: "Scorched Studio <bookings@scorchedstudio.com>",
    to: booking.email,
    subject: "Your Scorched Studio Booking Has Been Updated",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">Booking updated, ${booking.name.split(" ")[0]}!</h1>
        <p style="color: #555; margin-bottom: 24px;">Here are your updated booking details:</p>
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
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${party_size} ${party_size === 1 ? "person" : "people"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #888; font-size: 13px;">Location</td>
            <td style="padding: 8px 0; font-size: 13px;">218 E University Pkwy, Orem, UT 84058</td>
          </tr>
        </table>
        <p style="color: #555; font-size: 14px;">
          Need to make more changes? Visit
          <a href="https://scorchedstudio.com/book/manage" style="color: #884A20;">scorchedstudio.com/book/manage</a>.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 12px;">Please do not reply to this email — it is not monitored.</p>
        <p style="color: #555; font-size: 14px; margin-top: 24px;">
          See you soon!<br/><strong>— The Scorched Studio Team</strong>
        </p>
      </div>
    `,
  }).catch((e) => console.error("UPDATE_EMAIL_ERROR", e));

  return Response.json({ ok: true });
}
