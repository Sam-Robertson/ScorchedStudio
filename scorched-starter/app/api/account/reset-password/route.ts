// app/api/account/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateCustomerPassword } from "@/lib/customers";
import { hashPassword } from "@/lib/customer-password";
import { CUSTOMER_SESSION_COOKIE, signCustomerSessionToken, verifyResetToken } from "@/lib/customer-session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Enter a new password." },
      { status: 400 }
    );
  }

  const email = verifyResetToken(parsed.data.token);
  if (!email) {
    return Response.json(
      { error: "This reset link has expired or was already used. Request a new one." },
      { status: 400 }
    );
  }

  await updateCustomerPassword(email, hashPassword(parsed.data.password));

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
