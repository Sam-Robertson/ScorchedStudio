// app/api/admin/accounting/projections/route.ts
// Phase 6: projection-vs-actual and trailing-12 DSCR (§7 v_projection_vs_actual,
// v_dscr_ttm). GET reads both views. POST upserts rows into `projection_months`
// — this is how the business's own 24-month model gets loaded; there's no
// synthetic fallback here on purpose (§ build note: don't invent projection
// numbers from trailing actuals and present them as the model).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data: projectionVsActual, error: pvaErr } = await sb
      .from("v_projection_vs_actual")
      .select("*")
      .order("period_month");
    if (pvaErr) throw new Error(pvaErr.message);

    const { data: dscr, error: dscrErr } = await sb.from("v_dscr_ttm").select("*").order("period_month");
    if (dscrErr) throw new Error(dscrErr.message);

    const { count: modelRowCount } = await sb.from("projection_months").select("*", { count: "exact", head: true });

    return Response.json({
      projectionVsActual: projectionVsActual ?? [],
      dscr: dscr ?? [],
      modelLoaded: (modelRowCount ?? 0) > 0,
    });
  } catch (err) {
    console.error("ACCOUNTING_PROJECTIONS_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

type ProjectionMonthInput = {
  periodMonth: string; // YYYY-MM-DD (first of month)
  revenue?: number | null;
  cogs?: number | null;
  payroll?: number | null;
  rent?: number | null;
  marketing?: number | null;
  otherOpex?: number | null;
  ebitda?: number | null;
  debtService?: number | null;
};

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const body = await req.json();
    const rows: ProjectionMonthInput[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return Response.json({ error: "rows (array) is required" }, { status: 400 });

    const upsertRows = rows.map((r) => ({
      period_month: r.periodMonth,
      revenue: r.revenue ?? null,
      cogs: r.cogs ?? null,
      payroll: r.payroll ?? null,
      rent: r.rent ?? null,
      marketing: r.marketing ?? null,
      other_opex: r.otherOpex ?? null,
      ebitda: r.ebitda ?? null,
      debt_service: r.debtService ?? null,
    }));

    const { error } = await sb.from("projection_months").upsert(upsertRows, { onConflict: "period_month" });
    if (error) throw new Error(error.message);

    return Response.json({ upserted: upsertRows.length });
  } catch (err) {
    console.error("ACCOUNTING_PROJECTIONS_POST_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
