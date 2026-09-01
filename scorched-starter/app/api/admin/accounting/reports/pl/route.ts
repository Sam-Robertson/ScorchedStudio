// app/api/admin/accounting/reports/pl/route.ts
// Monthly P&L (§7 v_pl_monthly / v_pl_lines), any date range, optional
// location filter. YTD / custom range is just startMonth/endMonth.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

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

    return Response.json({ months: months ?? [], lines: lineItems ?? [] });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_PL_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
