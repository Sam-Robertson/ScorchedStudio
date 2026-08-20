// app/api/admin/memberships/route.ts
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { searchMemberships } from "@/lib/memberships";

export async function GET(req: NextRequest) {
  if (!requireInStudio(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  try {
    const memberships = await searchMemberships(q);
    return Response.json(memberships);
  } catch (err) {
    console.error("ADMIN_MEMBERSHIPS_SEARCH_ERROR", err);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
