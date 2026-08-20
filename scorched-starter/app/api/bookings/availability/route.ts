// app/api/bookings/availability/route.ts
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSlotsForDate, MAX_CAPACITY, type LocationKey } from "@/lib/booking-utils";
import { getLocationByKey } from "@/lib/locations";

async function capacityFor(location: LocationKey): Promise<number> {
  try {
    const loc = await getLocationByKey(location);
    return loc?.capacity ?? MAX_CAPACITY;
  } catch {
    return MAX_CAPACITY;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const month = searchParams.get("month");
  const location: LocationKey = searchParams.get("location") === "slc" ? "slc" : "orem";

  if (date) {
    const slots = await getSlotsForDate(date, location);
    if (slots.length === 0) return Response.json({ slots: [] });

    const capacity = await capacityFor(location);
    const excludeId = searchParams.get("exclude_id");
    let query = getSupabase()
      .from("bookings")
      .select("time_slot, party_size")
      .eq("date", date)
      .eq("location", location)
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
        const available = capacity - booked;
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

    const capacity = await capacityFor(location);

    const { data } = await getSupabase()
      .from("bookings")
      .select("date, time_slot, party_size")
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("location", location)
      .eq("status", "confirmed");

    // Group: date → slot → total booked
    const map: Record<string, Record<string, number>> = {};
    for (const row of data ?? []) {
      if (!map[row.date]) map[row.date] = {};
      map[row.date][row.time_slot] = (map[row.date][row.time_slot] ?? 0) + row.party_size;
    }

    // Walk every day in the month (not just days with bookings) so closed
    // days with zero bookings are still reported as closed.
    const fullDates: string[] = [];
    const closedDates: string[] = [];
    await Promise.all(
      Array.from({ length: lastDay }, (_, i) => i + 1).map(async (day) => {
        const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const slots = await getSlotsForDate(dateStr, location);
        if (slots.length === 0) {
          closedDates.push(dateStr);
          return;
        }
        const slotMap = map[dateStr] ?? {};
        if (slots.every((s) => (slotMap[s] ?? 0) >= capacity)) {
          fullDates.push(dateStr);
        }
      })
    );

    return Response.json({ fullDates, closedDates });
  }

  return Response.json({ error: "Provide date or month param" }, { status: 400 });
}
