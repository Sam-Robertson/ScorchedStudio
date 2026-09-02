// app/api/admin/accounting/reports/estimated-bookings/route.ts
// Pre-online-booking-launch proxy for booking volume. The online widget (the
// `bookings` table) has zero rows before 2026-03-24 — before that, sessions
// were booked through Acuity Scheduling and paid through Square, so the only
// historical signal is the same revenue_settlements data Sales & Products
// already reads: an order carrying a "General Admission" (or "...- Group")
// line item is one booked party. Counted per day so callers can bucket by
// month and drop anything on/after the real launch date themselves.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

type SquareOrderLineItem = { name?: string; quantity?: string };
type SquareOrder = { line_items?: SquareOrderLineItem[] };
type SettlementRaw = { orders?: SquareOrder[] };

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let query = sb
      .from("revenue_settlements")
      .select("settle_date, raw")
      .eq("provider", "square")
      .order("settle_date");
    if (start) query = query.gte("settle_date", start);
    if (end) query = query.lte("settle_date", end);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const byDate = new Map<string, { orders: number; seats: number }>();
    for (const row of data ?? []) {
      const raw = row.raw as SettlementRaw;
      for (const order of raw?.orders ?? []) {
        const admissionItems = (order.line_items ?? []).filter((li) => (li.name ?? "").includes("General Admission"));
        if (admissionItems.length === 0) continue;
        const seats = admissionItems.reduce((s, li) => s + Number(li.quantity ?? 1), 0);
        const entry = byDate.get(row.settle_date) ?? { orders: 0, seats: 0 };
        entry.orders += 1;
        entry.seats += seats;
        byDate.set(row.settle_date, entry);
      }
    }
    const daily = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return Response.json({ daily });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}
