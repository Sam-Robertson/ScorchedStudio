// app/api/account/logout/route.ts
import { NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
