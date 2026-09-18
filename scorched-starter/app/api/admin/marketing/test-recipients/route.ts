// app/api/admin/marketing/test-recipients/route.ts
//
// The configured test recipients, so the admin can pre-fill the test box
// instead of making someone retype their own address every time.
//
// Split by shape rather than returning the raw list: the composer needs to know
// which entry to offer for an email campaign and which for a text.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { testRecipients } from "@/lib/marketing/config";
import { normalizePhone } from "@/lib/marketing/phone";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const all = testRecipients();
  return Response.json({
    email: all.find((r) => r.includes("@")) ?? null,
    phone: all.map((r) => normalizePhone(r)).find(Boolean) ?? null,
  });
}
