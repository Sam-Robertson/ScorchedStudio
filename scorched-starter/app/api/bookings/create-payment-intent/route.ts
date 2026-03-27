// app/api/bookings/create-payment-intent/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE, PRICE_PER_PERSON_CENTS } from "@/lib/booking-utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().min(1),
  party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  referral_source: z.string().optional(),
  referral_other: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { date, time_slot, party_size, name, email, phone, referral_source, referral_other } = parsed.data;

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

  const paymentIntent = await stripe.paymentIntents.create({
    amount: party_size * PRICE_PER_PERSON_CENTS,
    currency: "usd",
    metadata: { date, time_slot, party_size: String(party_size), name, email, phone: phone ?? "", referral_source: referral_source ?? "", referral_other: referral_other ?? "" },
    receipt_email: email,
    description: `Scorched Studio – ${party_size} ${party_size === 1 ? "person" : "people"} on ${date} at ${time_slot}`,
  });

  return Response.json({ clientSecret: paymentIntent.client_secret });
}
