// scripts/send-test-booking-email.ts
//
// Sends the booking emails to one address so they can be read in a real inbox.
// It uses the same builders the routes use (lib/booking-emails.ts), so what
// arrives is exactly what a customer gets.
//
//   pnpm tsx scripts/send-test-booking-email.ts you@example.com
//   pnpm tsx scripts/send-test-booking-email.ts you@example.com <booking-id>
//
// With a booking id, the emails describe that real booking and their "Edit
// your booking" button opens it. Without one they use sample details and the
// button lands on the email lookup. Nothing is written to the database.
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./load-env.ts";

loadEnv();

import { manageBookingUrl } from "../lib/booking-link.ts";
import {
  BOOKING_EMAIL_FROM,
  bookingUpdatedEmail,
  paidBookingEmail,
  reservationEmail,
  type BookingEmailDetails,
} from "../lib/booking-emails.ts";
import { PRICE_PER_PERSON_CENTS } from "../lib/booking-rules.ts";

const [to, bookingId] = process.argv.slice(2);

if (!to || !to.includes("@")) {
  console.error("Usage: pnpm tsx scripts/send-test-booking-email.ts <to-email> [booking-id]");
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY");
  process.exit(1);
}

async function loadDetails(): Promise<BookingEmailDetails> {
  if (!bookingId) {
    return {
      name: "Test Customer",
      date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      timeSlot: "5:00 PM",
      partySize: 2,
      locationLine: "218 E University Pkwy, Orem, UT 84058",
      manageUrl: manageBookingUrl("00000000-0000-4000-8000-000000000000"),
    };
  }

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: booking, error } = await sb
    .from("bookings")
    .select("id, name, date, time_slot, party_size, location")
    .eq("id", bookingId)
    .single();
  if (error || !booking) {
    console.error(`Booking ${bookingId} not found.`);
    process.exit(1);
  }

  const { data: location } = await sb
    .from("locations")
    .select("name, address")
    .eq("key", booking.location ?? "orem")
    .maybeSingle();

  return {
    name: booking.name,
    date: booking.date,
    timeSlot: booking.time_slot,
    partySize: booking.party_size,
    locationLine: location?.address ?? location?.name ?? "Scorched Studio",
    manageUrl: manageBookingUrl(booking.id),
  };
}

async function main() {
  const details = await loadDetails();
  const paidCents = details.partySize * PRICE_PER_PERSON_CENTS;

  const messages = [
    ["Free reservation", reservationEmail({ ...details, paymentMethod: null })],
    ["Gift card reservation", reservationEmail({ ...details, paymentMethod: "gift_card" })],
    ["Paid booking", paidBookingEmail({ ...details, amountPaidCents: paidCents, kind: "new_booking" })],
    ["Payment for an existing booking", paidBookingEmail({ ...details, amountPaidCents: paidCents, kind: "payment_for_existing" })],
    ["Booking updated", bookingUpdatedEmail({ ...details, amountPaidCents: 0, paymentMethod: null })],
  ] as const;

  const resend = new Resend(process.env.RESEND_API_KEY);

  for (const [label, message] of messages) {
    const { data, error } = await resend.emails.send({
      from: BOOKING_EMAIL_FROM,
      to,
      subject: `[TEST: ${label}] ${message.subject}`,
      html: message.html,
    });
    console.log(error ? `FAILED  ${label}: ${error.message}` : `sent    ${label} (${data?.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
