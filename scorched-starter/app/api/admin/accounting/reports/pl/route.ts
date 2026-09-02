// app/api/admin/accounting/reports/pl/route.ts
// Monthly P&L (§7 v_pl_monthly / v_pl_lines), any date range, optional
// location filter. YTD / custom range is just startMonth/endMonth.
//
// v_pl_monthly and v_pl_lines group by (month, location) — but revenue
// settlements carry a location_id (Orem) while most bank-rule postings
// carry none, so every month splits into a revenue-heavy row and an
// expense-heavy row. Merged here into one row per month unless the caller
// explicitly asks for a single location, so every consumer of this route
// gets clean data without re-solving the split themselves.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

type PlMonthRow = {
  period_month: string;
  location_id: string | null;
  revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  net_income: number;
};

type PlLineRow = {
  period_month: string;
  location_id: string | null;
  code: string;
  name: string;
  type: string;
  amount: number;
};

function mergeMonths(rows: PlMonthRow[]): PlMonthRow[] {
  const byMonth = new Map<string, PlMonthRow>();
  for (const r of rows) {
    const existing = byMonth.get(r.period_month);
    if (!existing) {
      byMonth.set(r.period_month, { ...r, location_id: null });
      continue;
    }
    existing.revenue += Number(r.revenue);
    existing.cogs += Number(r.cogs);
    existing.gross_profit += Number(r.gross_profit);
    existing.operating_expenses += Number(r.operating_expenses);
    existing.ebitda += Number(r.ebitda);
    existing.depreciation += Number(r.depreciation);
    existing.interest += Number(r.interest);
    existing.net_income += Number(r.net_income);
  }
  return [...byMonth.values()].sort((a, b) => a.period_month.localeCompare(b.period_month));
}

function mergeLines(rows: PlLineRow[]): PlLineRow[] {
  const byKey = new Map<string, PlLineRow>();
  for (const r of rows) {
    const key = `${r.period_month}:${r.code}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, location_id: null });
      continue;
    }
    existing.amount += Number(r.amount);
  }
  return [...byKey.values()].sort((a, b) => a.period_month.localeCompare(b.period_month) || a.code.localeCompare(b.code));
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start"); // YYYY-MM-DD
    const end = searchParams.get("end");
    const locationId = searchParams.get("locationId");

    let monthly = sb.from("v_pl_monthly").select("*").order("period_month");
    if (start) monthly = monthly.gte("period_month", start);
    if (end) monthly = monthly.lte("period_month", end);
    if (locationId) monthly = monthly.eq("location_id", locationId);
    const { data: months, error: monthsErr } = await monthly;
    if (monthsErr) throw new Error(monthsErr.message);

    let lines = sb.from("v_pl_lines").select("*").order("period_month").order("code");
    if (start) lines = lines.gte("period_month", start);
    if (end) lines = lines.lte("period_month", end);
    if (locationId) lines = lines.eq("location_id", locationId);
    const { data: lineItems, error: linesErr } = await lines;
    if (linesErr) throw new Error(linesErr.message);

    return Response.json({
      months: locationId ? (months ?? []) : mergeMonths((months ?? []) as PlMonthRow[]),
      lines: locationId ? (lineItems ?? []) : mergeLines((lineItems ?? []) as PlLineRow[]),
      dataStartsAt: "2026-06-03",
    });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_PL_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
