// lib/customer-session.ts — server-only
//
// Email+password customer accounts. Two kinds of HMAC-signed 2-part tokens,
// same scheme as lib/admin-session.ts — no JWT library, no new dependency:
// a short-lived password-reset token (emailed) and a longer-lived session
// token (stored in an HttpOnly cookie). Credentials themselves live in the
// customers table (lib/customers.ts, lib/customer-password.ts).
import { createHmac, timingSafeEqual } from "crypto";

export const CUSTOMER_SESSION_COOKIE = "customer_session";

// Long enough to open the email and click through, short enough to limit
// exposure if the link leaks (forwarded, cached, pre-fetched by a scanner).
const RESET_TOKEN_TTL_MS = 1000 * 60 * 15;

// No refresh flow, same reasoning as admin-session.ts's 180-day TTL — a
// customer shouldn't have to re-log-in every few days.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type Purpose = "reset" | "session";
type Payload = { purpose: Purpose; email: string; exp: number };

function secret(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (!s) throw new Error("Missing CUSTOMER_SESSION_SECRET");
  return s;
}

function sign(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string, expectedPurpose: Purpose): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expectedSig = createHmac("sha256", secret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.purpose !== expectedPurpose) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  if (typeof payload.email !== "string" || !payload.email) return null;

  return payload.email;
}

export function signResetToken(email: string): string {
  return sign({ purpose: "reset", email, exp: Date.now() + RESET_TOKEN_TTL_MS });
}

// A reset token is single-purpose: it can only be used to set a new
// password, never as a session directly (a leaked email-scanner pre-click
// can't turn into a 30-day session that way).
export function verifyResetToken(token: string): string | null {
  return verify(token, "reset");
}

export function signCustomerSessionToken(email: string): string {
  return sign({ purpose: "session", email, exp: Date.now() + SESSION_TTL_MS });
}

export function verifyCustomerSessionToken(token: string): { email: string } | null {
  const email = verify(token, "session");
  return email ? { email } : null;
}
