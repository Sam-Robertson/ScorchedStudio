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

  const response = NextResponse.redirect(`${baseUrl}/account`);
  response.cookies.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
