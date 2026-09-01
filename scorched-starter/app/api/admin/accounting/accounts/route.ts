// app/api/admin/accounting/accounts/route.ts — chart of accounts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("accounts")
      .select("*")
      .order("code");
    if (error) {
      console.error("ACCOUNTING_ACCOUNTS_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
    return Response.json({ accounts: data });
  } catch (err) {
    console.error("ACCOUNTING_ACCOUNTS_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
