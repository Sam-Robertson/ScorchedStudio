// app/api/admin/session/route.ts
//
// Lets the client validate a stored token against the server on page load,
// instead of trusting "a token exists in localStorage" the way the old
// layout did (which would render the full admin shell for a stale/invalid
// token and only fail once an API call 401s).
import { NextRequest } from "next/server";
import { getSession } from "@/lib/admin-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(session);
}
