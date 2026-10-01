// app/api/bookings/reserve/route.ts
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";
import { getSupabase } from "@/lib/supabase";
import { getLocationByKey } from "@/lib/locations";
import { todayInDenverYmd } from "@/lib/timezone";
import { recordConsentSafe } from "@/lib/marketing/consent";
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";
import { manageBookingUrl } from "@/lib/booking-link";
import { BOOKING_EMAIL_FROM, reservationEmail } from "@/lib/booking-emails";

const resend = new Resend(process.env.RESEND_API_KEY);

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().min(1),
  party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  payment_method: z.enum(["gift_card"]).nullable().optional(),
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

  const { date, time_slot, party_size, name, email, phone, payment_method, referral_source, referral_other } = parsed.data;
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
      // Lowercased like the paid path, so the manage-by-email lookup finds it.
      email: email.toLowerCase().trim(),
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
      location,
    })
    .select("id")
    .single();

  if (dbError || !booking) {
    console.error("RESERVE_DB_ERROR", dbError);
    return Response.json({ error: "Failed to save reservation" }, { status: 500 });
  }

  const message = reservationEmail({
    name,
    date,
    timeSlot: time_slot,
    partySize: party_size,
    locationLine: locationRecord?.address ?? locationRecord?.name ?? "Scorched Studio",
    manageUrl: manageBookingUrl(booking.id),
    paymentMethod: payment_method ?? null,
  });

  await resend.emails.send({
    from: BOOKING_EMAIL_FROM,
    to: email,
    ...message,
  });

  return Response.json({ booking_id: booking.id });
}
