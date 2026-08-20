// app/api/admin/memberships/route.ts
import { NextRequest } from "next/server";
import { searchMemberships } from "@/lib/memberships";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
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
