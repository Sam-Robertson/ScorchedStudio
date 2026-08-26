// app/api/account/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerByEmail } from "@/lib/customers";
import { verifyPassword } from "@/lib/customer-password";
import { CUSTOMER_SESSION_COOKIE, signCustomerSessionToken } from "@/lib/customer-session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  const customer = await getCustomerByEmail(email);
  // Same "invalid email or password" message either way — don't reveal
  // whether the account exists.
  if (!customer || !verifyPassword(parsed.data.password, customer.password_hash)) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  // Unchecking "remember me" makes this a browser-session cookie (cleared
  // on browser close) rather than shortening the signed token itself — the
  // token's own 30-day exp is unrelated and still checked either way.
  const rememberMe = parsed.data.rememberMe ?? true;
  response.cookies.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS } : {}),
  });
  return response;
}
