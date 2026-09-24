// app/api/admin/accounting/reports/estimated-bookings/route.ts
// Pre-online-booking-launch proxy for booking volume. The online widget (the
// `bookings` table) has zero rows before 2026-03-24; before that, sessions
// were booked through Acuity Scheduling and paid through Square, so the only
// historical signal is the Square settlement data: an order carrying a
// "General Admission" line item is one booked party. Read from each day's
// stored order summary (raw.summary), counted per day so callers can bucket
// by month and drop anything on/after the real launch date themselves.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { loadSquareSettlementSummaries } from "@/lib/accounting/settlement-summary-rows";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const rows = await loadSquareSettlementSummaries(searchParams.get("start"), searchParams.get("end"));
    const daily = rows
      .filter((r) => r.summary.admissionOrders > 0)
      .map((r) => ({ date: r.settle_date, orders: r.summary.admissionOrders, seats: r.summary.admissionSeats }));
    return Response.json({ daily });
  } catch (e) {
    console.error("ACCOUNTING_REPORTS_ESTIMATED_BOOKINGS_ERROR", e);
    return Response.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}
