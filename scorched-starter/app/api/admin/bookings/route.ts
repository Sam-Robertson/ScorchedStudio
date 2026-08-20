// app/api/admin/bookings/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = getSupabase()
    .from("bookings")
    .select("*")
    .order("date", { ascending: true })
    .order("time_slot", { ascending: true });

  if (session.role === "location") {
    query = query.eq("location", session.location);
  } else {
    const locationFilter = new URL(req.url).searchParams.get("location");
    if (locationFilter) query = query.eq("location", locationFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ADMIN_BOOKINGS_ERROR", error);
    return Response.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().min(1),
  party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  payment_method: z.enum(["stripe", "gift_card", "get_out_pass", "complimentary"]),
  location: z.enum(["orem", "slc"]).optional(),
});

export async function POST(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name, email, phone, date, time_slot, party_size, payment_method } = parsed.data;
  // A location-tier session can only ever create bookings for its own
  // location; admin may specify one (defaulting to Orem).
  const location = session.role === "location" ? session.location! : parsed.data.location ?? "orem";

  const validSlots = await getSlotsForDate(date, location);
  if (!validSlots.includes(time_slot)) {
    return Response.json({ error: "Invalid time slot for this date." }, { status: 400 });
  }

  // Check capacity — scoped to this location so Orem and SLC don't share one pool.
  const { data: existing } = await getSupabase()
    .from("bookings")
    .select("party_size")
    .eq("date", date)
    .eq("time_slot", time_slot)
    .eq("status", "confirmed")
    .eq("location", location);

  const totalBooked = (existing ?? []).reduce((sum, r) => sum + r.party_size, 0);
  const remaining = MAX_CAPACITY - totalBooked;

  if (party_size > remaining) {
    const available = Math.max(0, remaining);
    return Response.json(
      {
        error:
          available <= 0
            ? "This time slot is fully booked."
            : `Only ${available} spot${available === 1 ? "" : "s"} available for this slot.`,
      },
      { status: 409 }
    );
  }

  const { data: booking, error } = await getSupabase()
    .from("bookings")
    .insert({
      name,
      email: email ? email.toLowerCase().trim() : null,
      phone: phone ?? null,
      date,
      time_slot,
      party_size,
      payment_method,
      amount_paid: 0,
      status: "confirmed",
      location,
    })
    .select()
    .single();

  if (error) {
    console.error("ADMIN_CREATE_BOOKING_ERROR", error);
    return Response.json({ error: "Failed to create booking." }, { status: 500 });
  }

  return Response.json(booking, { status: 201 });
}
