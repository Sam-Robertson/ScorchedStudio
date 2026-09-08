// lib/course-guest-account.ts - server-only
//
// Course enrolment used to be gated behind "log in first". Now the account is
// folded into the purchase form: a visitor supplies name/email/password
// alongside their card details and gets an account without ever visiting a
// signup page. Shared by the checkout and waitlist routes so the two can't
// drift on the security-relevant parts.
import { NextRequest, NextResponse } from "next/server";
import { createCustomer, getCustomerByEmail } from "@/lib/customers";
import { hashPassword } from "@/lib/customer-password";
import { sendAccountCreatedEmail } from "@/lib/customer-notify";
import {
  CUSTOMER_SESSION_COOKIE,
  signCustomerSessionToken,
  verifyCustomerSessionToken,
} from "@/lib/customer-session";

// Matches app/api/account/signup/route.ts: same 30 days as the session TTL
// in lib/customer-session.ts.
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Kept identical to the signup route's rule so a password that works on one
// path can't be rejected on the other.
const MIN_PASSWORD_LENGTH = 8;

export type ResolvedCustomer =
  | { ok: true; email: string; issueSession: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Returns the email to enrol, creating the account first if this is a guest.
 *
 * An already-registered email is deliberately turned away rather than
 * verified against the supplied password: checking it here would turn a
 * public, unthrottled purchase form into a credential-testing oracle, since
 * the response would tell an attacker whether a guessed password was right.
 * Returning customers log in, which is rate-limit-able in one place.
 */
export async function resolveCustomerForCourseAction(
  req: NextRequest,
  guest: { email?: string; password?: string }
): Promise<ResolvedCustomer> {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;
  if (session) {
    return { ok: true, email: session.email, issueSession: false };
  }

  const email = guest.email?.toLowerCase().trim();
  const password = guest.password;

  if (!email || !password) {
    return {
      ok: false,
      status: 400,
      body: { error: "Enter your email and choose a password to continue." },
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
    };
  }

  const existing = await getCustomerByEmail(email);
  if (existing) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "You already have an account with that email. Log in to enroll.",
        requiresLogin: true,
      },
    };
  }

  await createCustomer(email, hashPassword(password));
  sendAccountCreatedEmail(email).catch((err) =>
    console.error("COURSE_GUEST_SIGNUP_WELCOME_EMAIL_ERROR", email, err)
  );

  return { ok: true, email, issueSession: true };
}

// Logs the new account in on the same response that carries the Stripe URL,
// so they come back from checkout already signed in.
export function attachCustomerSession(response: NextResponse, email: string): NextResponse {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
