// app/api/admin/bookings/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, MAX_PARTY_SIZE } from "@/lib/booking-utils";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("update"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_slot: z.string().min(1),
    party_size: z.number().int().min(1).max(MAX_PARTY_SIZE),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────
  if (parsed.data.action === "cancel") {
    const { error } = await getSupabase()
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) {
      console.error("ADMIN_CANCEL_BOOKING_ERROR", error);
      return Response.json({ error: "Failed to cancel booking" }, { status: 500 });
    }

    return Response.json({ ok: true });
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  const { date, time_slot, party_size } = parsed.data;

  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return Response.json({ error: "Cannot book a date in the past." }, { status: 400 });
  }

  const validSlots = await getSlotsForDate(date);
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

  const { error } = await getSupabase()
    .from("bookings")
    .update({ date, time_slot, party_size })
    .eq("id", id);

  if (error) {
    console.error("ADMIN_UPDATE_BOOKING_ERROR", error);
    return Response.json({ error: "Failed to update booking." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
