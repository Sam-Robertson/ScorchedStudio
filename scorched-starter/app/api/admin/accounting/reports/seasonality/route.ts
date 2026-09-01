// app/api/admin/accounting/reports/seasonality/route.ts
// Monthly revenue vs trailing-12 average (§7 v_seasonality).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("v_seasonality").select("*").order("period_month");
    if (error) throw new Error(error.message);
    return Response.json({ rows: data ?? [] });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_SEASONALITY_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
