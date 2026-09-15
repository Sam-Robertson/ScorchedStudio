// app/api/admin/accounting/plaid/reconnected/route.ts
// Called after Plaid Link update mode succeeds for an item the nightly sync
// marked login_required. Update mode keeps the same access token, so there
// is nothing to exchange; this just puts the item back in the nightly sync,
// which picks up from its saved cursor and pulls everything it missed.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const plaidItemId = typeof body?.plaidItemId === "string" ? body.plaidItemId : null;
  if (!plaidItemId) return Response.json({ error: "plaidItemId is required" }, { status: 400 });

  const { error } = await getSupabase()
    .from("plaid_items")
    .update({ status: "ok" })
    .eq("id", plaidItemId)
    .eq("status", "login_required");
  if (error) {
    console.error("PLAID_RECONNECTED_ERROR", plaidItemId, error);
    return Response.json({ error: "Failed to update the connection" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
