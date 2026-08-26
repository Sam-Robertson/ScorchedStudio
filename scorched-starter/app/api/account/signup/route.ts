// app/api/account/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomer, getCustomerByEmail } from "@/lib/customers";
import { hashPassword } from "@/lib/customer-password";
import { CUSTOMER_SESSION_COOKIE, signCustomerSessionToken } from "@/lib/customer-session";
import { sendAccountCreatedEmail } from "@/lib/customer-notify";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Enter a valid email and password." },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  const existing = await getCustomerByEmail(email);
  if (existing) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  await createCustomer(email, hashPassword(parsed.data.password));
  sendAccountCreatedEmail(email).catch((err) => console.error("ACCOUNT_SIGNUP_WELCOME_EMAIL_ERROR", err));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
