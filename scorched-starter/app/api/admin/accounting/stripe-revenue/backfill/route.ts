// app/api/admin/accounting/stripe-revenue/backfill/route.ts
// On-demand backfill for a date range, mirroring the Square revenue
// backfill route. Each day is independently idempotent (revenue-job.ts),
// so re-running an overlapping range is safe.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { postStripeRevenueForDay } from "@/lib/accounting/revenue-job";

function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function* datesBetween(start: string, end: string): Generator<string> {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= last) {
    yield cur.toISOString().slice(0, 10);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { startDate, endDate } = body;
    if (!isDateStr(startDate) || !isDateStr(endDate)) {
      return Response.json({ error: "startDate and endDate are required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (startDate > endDate) {
      return Response.json({ error: "startDate must be on or before endDate" }, { status: 400 });
    }

    const results: Record<string, unknown> = {};
    for (const dateStr of datesBetween(startDate, endDate)) {
      try {
        results[dateStr] = await postStripeRevenueForDay(dateStr);
      } catch (err) {
        console.error("STRIPE_REVENUE_BACKFILL_ERROR", dateStr, err);
        results[dateStr] = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    }

    return Response.json({ results });
  } catch (err) {
    console.error("STRIPE_REVENUE_BACKFILL_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
