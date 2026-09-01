// app/api/admin/accounting/plaid/link-token/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { createLinkToken } from "@/lib/plaid";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { link_token } = await createLinkToken("scorched-studio-admin");
    return Response.json({ linkToken: link_token });
  } catch (err) {
    console.error("PLAID_LINK_TOKEN_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Failed to create link token" }, { status: 500 });
  }
}
