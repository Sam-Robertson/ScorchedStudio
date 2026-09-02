// app/api/admin/accounting/reports/costs/route.ts
// Cost breakdowns for the Costs / Cost Details reporting tabs: total
// operating costs / labor / COGS, a per-account breakdown (for the
// operating-costs pie), a per-account monthly series (for the stacked
// "cost categories by month" bar), and a labor-only monthly trend.
//
// "Labor" = 6000 Payroll: Wages + 6010 Payroll: Employer Taxes, split out
// from "operating costs" the same way the old Domo dashboard did (COGS and
// labor reported as their own totals, everything else bucketed as opex).
// Depreciation (7000) and interest (8000) are excluded from all of this —
// they're their own P&L lines, not operating costs.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const LABOR_CODES = new Set(["6000", "6010"]);
const EXCLUDED_CODES = new Set(["7000", "8000"]);
const COGS_TYPE = "cogs";

type PlLineRow = { period_month: string; location_id: string | null; code: string; name: string; type: string; amount: number };

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let query = sb.from("v_pl_lines").select("*").in("type", ["expense", "cogs"]).order("period_month").order("code");
    if (start) query = query.gte("period_month", start);
    if (end) query = query.lte("period_month", end);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as PlLineRow[];

    let totalOperatingCosts = 0, totalLaborCosts = 0, totalCogs = 0;
    const breakdownByCode = new Map<string, { code: string; name: string; amount: number }>();
    const monthlyByCode = new Map<string, Map<string, number>>(); // period_month -> code -> amount
    const laborByMonth = new Map<string, number>();
    const codeNames = new Map<string, string>();

    for (const r of rows) {
      const amount = Number(r.amount);
      codeNames.set(r.code, r.name);

      if (r.type === COGS_TYPE) {
        totalCogs += amount;
      } else if (LABOR_CODES.has(r.code)) {
        totalLaborCosts += amount;
        laborByMonth.set(r.period_month, (laborByMonth.get(r.period_month) ?? 0) + amount);
      } else if (!EXCLUDED_CODES.has(r.code)) {
        totalOperatingCosts += amount;
        const existing = breakdownByCode.get(r.code);
        if (existing) existing.amount += amount;
        else breakdownByCode.set(r.code, { code: r.code, name: r.name, amount });
      } else {
        continue; // depreciation/interest excluded entirely
      }

      if (!EXCLUDED_CODES.has(r.code)) {
        if (!monthlyByCode.has(r.period_month)) monthlyByCode.set(r.period_month, new Map());
        const m = monthlyByCode.get(r.period_month)!;
        m.set(r.code, (m.get(r.code) ?? 0) + amount);
      }
    }

    const months = [...monthlyByCode.keys()].sort();
    const monthlyCategories = months.map((period_month) => {
      const row: Record<string, string | number> = { period_month };
      for (const [code, amount] of monthlyByCode.get(period_month)!) {
        row[codeNames.get(code) ?? code] = amount;
      }
      return row;
    });

    return Response.json({
      totals: {
        totalOperatingCosts: Math.round(totalOperatingCosts * 100) / 100,
        totalLaborCosts: Math.round(totalLaborCosts * 100) / 100,
        totalCogs: Math.round(totalCogs * 100) / 100,
      },
      breakdown: [...breakdownByCode.values()].sort((a, b) => b.amount - a.amount),
      monthlyCategories,
      laborByMonth: [...laborByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period_month, amount]) => ({ period_month, amount })),
      dataStartsAt: "2025-06-06",
    });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_COSTS_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
