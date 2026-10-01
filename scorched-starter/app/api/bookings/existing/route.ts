// app/api/bookings/existing/route.ts
//
// "Do you already have a booking that day?" Asked by the booking form before
// the review step, so someone coming back to pay or to mention a gift card is
// pointed at the booking they have instead of making a second one.
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { isBookingEditable, sameCustomer } from "@/lib/booking-rules";
import { signBookingToken } from "@/lib/booking-link";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  const { date, email, phone } = parsed.data;

  const { data, error } = await getSupabase()
    .from("bookings")
    .select("id, email, phone, date, time_slot, party_size, payment_method, amount_paid, location")
    .eq("date", date)
    .eq("status", "confirmed");

  if (error) {
    console.error("EXISTING_BOOKING_LOOKUP_ERROR", error);
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }

  // Matched in code rather than in the query because phone numbers are stored
  // as typed, and one day of bookings is a small list. A match on phone alone
  // counts: the repeat booking often has a mistyped email.
  const bookings = (data ?? [])
    .filter((b) => sameCustomer(b, { email, phone }) && isBookingEditable(b.date, b.time_slot))
    .map((b) => ({
      id: b.id,
      date: b.date,
      time_slot: b.time_slot,
      party_size: b.party_size,
      payment_method: b.payment_method,
      amount_paid: b.amount_paid,
      location: b.location,
      // Lets the form hand them straight to the edit page for this booking,
      // which matters when the match was on phone and the emails differ.
      token: signBookingToken(b.id),
    }));

  return Response.json({ bookings });
}
