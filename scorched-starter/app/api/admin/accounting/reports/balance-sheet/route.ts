// app/api/admin/accounting/reports/balance-sheet/route.ts
// Balance sheet as of a date (§7 balance_sheet(as_of) function).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const asOf = searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);

    const { data, error } = await sb.rpc("balance_sheet", { as_of: asOf });
    if (error) throw new Error(error.message);

    return Response.json({ asOf, rows: data ?? [] });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_BALANCE_SHEET_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
