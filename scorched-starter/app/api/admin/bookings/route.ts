// app/api/admin/bookings/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabase()
    .from("bookings")
    .select("*")
    .order("date", { ascending: true })
    .order("time_slot", { ascending: true });

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
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name, email, phone, date, time_slot, party_size, payment_method } = parsed.data;

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
    })
    .select()
    .single();

  if (error) {
    console.error("ADMIN_CREATE_BOOKING_ERROR", error);
    return Response.json({ error: "Failed to create booking." }, { status: 500 });
  }

  return Response.json(booking, { status: 201 });
}
