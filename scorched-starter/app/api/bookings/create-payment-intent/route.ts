// app/api/bookings/create-payment-intent/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE, PRICE_PER_PERSON_CENTS } from "@/lib/booking-utils";
import { getLocationByKey } from "@/lib/locations";
import { todayInDenverYmd } from "@/lib/timezone";
import { recordConsentSafe } from "@/lib/marketing/consent";
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

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
  location: z.enum(["orem", "slc"]).optional(),
  emailOptIn: z.boolean().optional().default(false),
  smsOptIn: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { date, time_slot, party_size, name, email, phone, referral_source, referral_other } = parsed.data;
  const { emailOptIn, smsOptIn } = parsed.data;
  const location = parsed.data.location ?? "orem";
  const locationRecord = await getLocationByKey(location);
  const capacity = locationRecord?.capacity ?? MAX_CAPACITY;

  const today = todayInDenverYmd();
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  const validSlots = await getSlotsForDate(date, location);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Marketing opt-in. Recorded when the form is submitted with a box ticked,
  // which is the moment the person actually agreed, rather than after payment
  // clears. recordConsentSafe never throws, so a marketing failure cannot take
  // down a booking.
  if (emailOptIn || smsOptIn) {
    const { ip, userAgent } = consentMetaFrom(req);
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const consent = await recordConsentSafe({
      email,
      phone: smsOptIn ? phone : null,
      firstName: firstName || null,
      lastName: rest.length ? rest.join(" ") : null,
      channels: [
        ...(emailOptIn ? [{ channel: "email" as const, optIn: true }] : []),
        ...(smsOptIn ? [{ channel: "sms" as const, optIn: true }] : []),
      ],
      source: "booking",
      consentText: [emailOptIn ? EMAIL_CONSENT_TEXT : null, smsOptIn ? SMS_CONSENT_TEXT : null]
        .filter(Boolean)
        .join(" "),
      ip,
      userAgent,
      tags: [location],
    });
    if (consent?.applied.includes("email")) {
      await syncSubscriberToResend(consent.subscriber);
    }
  }

  // Check capacity
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("party_size")
    .eq("date", date)
    .eq("time_slot", time_slot)
    .eq("location", location)
    .eq("status", "confirmed");

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

  const paymentIntent = await stripe.paymentIntents.create({
    amount: party_size * PRICE_PER_PERSON_CENTS,
    currency: "usd",
    // Mirrors whatever's enabled in the Stripe Dashboard (Link is disabled
    // there account-wide) instead of hardcoding a method list that would
    // also silently exclude every other enabled method.
    automatic_payment_methods: { enabled: true },
    metadata: { date, time_slot, party_size: String(party_size), name, email, phone: phone ?? "", referral_source: referral_source ?? "", referral_other: referral_other ?? "", location },
    receipt_email: email,
    description: `Scorched Studio – ${party_size} ${party_size === 1 ? "person" : "people"} on ${date} at ${time_slot}`,
  });

  return Response.json({ clientSecret: paymentIntent.client_secret });
}
