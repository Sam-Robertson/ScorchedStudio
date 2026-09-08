// app/api/account/me/route.ts
//
// Session probe for the header avatar. Deliberately client-fetched rather
// than read from cookies() in components/Header.tsx: Header lives in the root
// layout, so a cookies() call there would opt every route on the site into
// dynamic rendering, including the statically generated blog pages.
//
// Returns 200 either way — a logged-out visitor is the normal case here, not
// an error, and a 401 on every page load just fills their console.
import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import { getDisplayNameByEmail, initialsFor } from "@/lib/customer-identity";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const name = await getDisplayNameByEmail(session.email);

  return NextResponse.json(
    {
      authenticated: true,
      email: session.email,
      name,
      initials: initialsFor(name, session.email),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
