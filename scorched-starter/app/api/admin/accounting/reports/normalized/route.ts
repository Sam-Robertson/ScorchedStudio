// app/api/admin/accounting/reports/normalized/route.ts
// Normalized P&L (§7 v_pl_normalized): base EBITDA + labeled adjustments,
// always shown alongside the base figure, never hidden (§8 /normalized).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data: normalized, error: normErr } = await sb.from("v_pl_normalized").select("*").order("period_month");
    if (normErr) throw new Error(normErr.message);
    const { data: adjustments, error: adjErr } = await sb.from("pl_adjustments").select("*").order("period_month");
    if (adjErr) throw new Error(adjErr.message);
    return Response.json({ normalized: normalized ?? [], adjustments: adjustments ?? [] });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_NORMALIZED_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { periodMonth, label, amount, note } = body;
    if (!periodMonth || !label || typeof amount !== "number") {
      return Response.json({ error: "periodMonth, label, and numeric amount are required" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("pl_adjustments")
      .insert({ period_month: periodMonth, label, amount, note: note ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ adjustment: data });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_NORMALIZED_POST_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
