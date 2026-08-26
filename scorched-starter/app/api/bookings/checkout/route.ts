// app/api/bookings/checkout/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE, PRICE_PER_PERSON_CENTS } from "@/lib/booking-utils";
import { getSupabase } from "@/lib/supabase";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  time_slot: z.string().min(1),
  party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, time_slot, party_size, name, email, phone } = parsed.data;

  // Reject past dates
  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  // Validate slot exists for that date/day
  const validSlots = await getSlotsForDate(date);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Check current capacity
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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Scorched Studio Session",
            description: `${formattedDate} at ${time_slot} · ${party_size} ${
              party_size === 1 ? "person" : "people"
            }`,
          },
          unit_amount: PRICE_PER_PERSON_CENTS,
        },
        quantity: party_size,
      },
    ],
    metadata: {
      name,
      email,
      phone: phone ?? "",
      date,
      time_slot,
      party_size: String(party_size),
    },
    success_url: `${baseUrl}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/book`,
  });

  return Response.json({ url: session.url });
}
