// app/api/admin/accounting/bank-accounts/route.ts
// Maps a Plaid-discovered account (from /plaid/exchange) to a ledger
// account, completing the Plaid Link flow. GET lists existing mappings.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("bank_accounts")
      .select("*, accounts(code,name), plaid_items(institution_name,last_synced_at,status), locations(key,name)")
      .order("created_at");
    if (error) {
      console.error("ACCOUNTING_BANK_ACCOUNTS_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch bank accounts" }, { status: 500 });
    }
    return Response.json({ bankAccounts: data });
  } catch (err) {
    console.error("ACCOUNTING_BANK_ACCOUNTS_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const plaidItemId: unknown = body.plaidItemId;
    const plaidAccountId: unknown = body.plaidAccountId;
    const name: unknown = body.name;
    const mask: unknown = body.mask;
    const kind: unknown = body.kind;
    const ledgerAccountCode: unknown = body.ledgerAccountCode;
    const defaultLocation: unknown = body.defaultLocation; // 'orem' | 'slc' | null

    if (typeof plaidItemId !== "string" || typeof plaidAccountId !== "string" || typeof ledgerAccountCode !== "string") {
      return Response.json({ error: "plaidItemId, plaidAccountId, and ledgerAccountCode are required" }, { status: 400 });
    }

    const sb = getSupabase();

    const { data: account, error: accountErr } = await sb
      .from("accounts")
      .select("id")
      .eq("code", ledgerAccountCode)
      .single();
    if (accountErr || !account) return Response.json({ error: `Unknown ledger account code ${ledgerAccountCode}` }, { status: 400 });

    let defaultLocationId: string | null = null;
    if (defaultLocation === "orem" || defaultLocation === "slc") {
      const { data: loc } = await sb.from("locations").select("id").eq("key", defaultLocation).single();
      defaultLocationId = loc?.id ?? null;
    }

    const { data, error } = await sb
      .from("bank_accounts")
      .insert({
        plaid_item_id: plaidItemId,
        plaid_account_id: plaidAccountId,
        ledger_account_id: account.id,
        name: typeof name === "string" ? name : null,
        mask: typeof mask === "string" ? mask : null,
        kind: typeof kind === "string" ? kind : null,
        default_location_id: defaultLocationId,
      })
      .select()
      .single();

    if (error) {
      console.error("ACCOUNTING_BANK_ACCOUNTS_POST_ERROR", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ bankAccount: data });
  } catch (err) {
    console.error("ACCOUNTING_BANK_ACCOUNTS_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
