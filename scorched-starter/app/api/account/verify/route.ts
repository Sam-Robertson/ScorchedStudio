// app/api/account/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE, signCustomerSessionToken, verifyLoginToken } from "@/lib/customer-session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";

  const email = token ? verifyLoginToken(token) : null;
  if (!email) {
    return NextResponse.redirect(`${baseUrl}/account/login?error=expired`);
  }

  // Only a same-site relative path is allowed here — this value came back
  // through an unsigned query param, so treat it as untrusted input rather
  // than letting it redirect off-site.
  const redirectParam = req.nextUrl.searchParams.get("redirect");
  const destination = redirectParam && /^\/(?!\/)/.test(redirectParam) ? redirectParam : "/account";

  const response = NextResponse.redirect(`${baseUrl}${destination}`);
  response.cookies.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
