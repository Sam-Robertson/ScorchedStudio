// app/api/admin/accounting/plaid/exchange/route.ts
// Exchanges a Plaid Link public_token for an access_token, stores the item
// (encrypted), and returns the underlying Plaid accounts so the admin can
// map each one to a ledger account (POST /api/admin/accounting/bank-accounts).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { encryptToken, exchangePublicToken, getAccounts, toPgBytea } from "@/lib/plaid";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const publicToken: unknown = body.publicToken;
    const institutionName: unknown = body.institutionName;
    if (typeof publicToken !== "string" || !publicToken) {
      return Response.json({ error: "publicToken is required" }, { status: 400 });
    }

    const { access_token, item_id } = await exchangePublicToken(publicToken);
    const { accounts } = await getAccounts(access_token);

    const sb = getSupabase();
    const { data: item, error } = await sb
      .from("plaid_items")
      .insert({
        institution_name: typeof institutionName === "string" && institutionName ? institutionName : "Unknown institution",
        item_id,
        access_token_enc: toPgBytea(encryptToken(access_token)),
      })
      .select("id, institution_name")
      .single();

    if (error) {
      console.error("PLAID_EXCHANGE_STORE_ERROR", error);
      return Response.json({ error: "Failed to store Plaid item" }, { status: 500 });
    }

    return Response.json({
      plaidItemId: item.id,
      institutionName: item.institution_name,
      accounts: accounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
      })),
    });
  } catch (err) {
    console.error("PLAID_EXCHANGE_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
