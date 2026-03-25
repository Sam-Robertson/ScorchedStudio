// app/api/bookings/availability/route.ts
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY } from "@/lib/booking-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const month = searchParams.get("month");

  if (date) {
    const slots = getSlotsForDate(date);
    if (slots.length === 0) return Response.json({ slots: [] });

    const excludeId = searchParams.get("exclude_id");
    let query = getSupabase()
      .from("bookings")
      .select("time_slot, party_size")
      .eq("date", date)
      .eq("status", "confirmed");
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query;

    const bookedBySlot: Record<string, number> = {};
    for (const row of data ?? []) {
      bookedBySlot[row.time_slot] = (bookedBySlot[row.time_slot] ?? 0) + row.party_size;
    }

    return Response.json({
      slots: slots.map((time) => {
        const booked = bookedBySlot[time] ?? 0;
        const available = MAX_CAPACITY - booked;
        return { time, available: Math.max(0, available), isFull: available <= 0 };
      }),
    });
  }

  if (month) {
    // month = "YYYY-MM"
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const mon = Number(monthStr);
    const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
    // Last day of month
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data } = await getSupabase()
      .from("bookings")
      .select("date, time_slot, party_size")
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("status", "confirmed");

    // Group: date → slot → total booked
    const map: Record<string, Record<string, number>> = {};
    for (const row of data ?? []) {
      if (!map[row.date]) map[row.date] = {};
      map[row.date][row.time_slot] = (map[row.date][row.time_slot] ?? 0) + row.party_size;
    }

    // A date is "full" when every slot has >= MAX_CAPACITY booked
    const fullDates: string[] = [];
    for (const [dateStr, slotMap] of Object.entries(map)) {
      const slots = getSlotsForDate(dateStr);
      if (slots.length === 0) continue;
      if (slots.every((s) => (slotMap[s] ?? 0) >= MAX_CAPACITY)) {
        fullDates.push(dateStr);
      }
    }

    return Response.json({ fullDates });
  }

  return Response.json({ error: "Provide date or month param" }, { status: 400 });
}
