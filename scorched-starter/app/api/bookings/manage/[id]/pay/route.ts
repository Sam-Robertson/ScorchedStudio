// app/api/bookings/manage/[id]/pay/route.ts
//
// Starts a card payment for whatever a booking still owes: the whole fee on a
// reservation made without paying, or the difference when a paid party grew.
// This is what stops people making a second, paid booking for the same visit:
// the payment lands on the booking they already have.
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { amountDueCents, canPayOnline, isBookingEditable } from "@/lib/booking-rules";
import { canManageBooking } from "@/lib/booking-link";
import { extraPaymentsEnabled } from "@/lib/booking-payments";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const schema = z.object({
  email: z.string().email().optional(),
  token: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: booking, error } = await getSupabase()
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !booking) {
    return Response.json({ error: "Booking not found." }, { status: 404 });
  }

  if (!canManageBooking(booking, parsed.data)) {
    return Response.json({ error: "We couldn't verify this booking." }, { status: 403 });
  }

  if (booking.status !== "confirmed") {
    return Response.json({ error: "This booking has been cancelled." }, { status: 410 });
  }

  if (!isBookingEditable(booking.date, booking.time_slot)) {
    return Response.json(
      { error: "This session has already started, so it can only be paid for in studio." },
      { status: 400 }
    );
  }

  if (!canPayOnline(booking)) {
    return Response.json({ error: "This booking doesn't have anything to pay online." }, { status: 409 });
  }

  // A second payment on a booking needs somewhere to be recorded. Checked
  // before charging, so nobody pays and is then refunded.
  if (booking.stripe_payment_intent_id && !(await extraPaymentsEnabled())) {
    return Response.json(
      { error: "Paying for extra guests online isn't available right now. The difference will be collected in studio." },
      { status: 409 }
    );
  }

  const amount = amountDueCents(booking);
  const people = `${booking.party_size} ${booking.party_size === 1 ? "person" : "people"}`;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    // booking_id is what tells createBookingFromIntent to apply this payment to
    // the existing booking instead of inserting a new one.
    metadata: {
      booking_id: booking.id,
      date: booking.date,
      time_slot: booking.time_slot,
      party_size: String(booking.party_size),
      name: booking.name,
      email: booking.email,
      location: booking.location ?? "orem",
    },
    receipt_email: booking.email,
    description: `Scorched Studio – ${people} on ${booking.date} at ${booking.time_slot} (payment for existing booking)`,
  });

  return Response.json({ clientSecret: paymentIntent.client_secret, amount });
}
