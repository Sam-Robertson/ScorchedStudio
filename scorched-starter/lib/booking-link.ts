// lib/booking-link.ts (server only)
//
// The "Edit your booking" link in booking emails. It carries a signature of the
// booking id, so clicking it opens that booking directly: nobody has to copy a
// booking id or retype their email. Same HMAC approach as customer-session.ts,
// no new dependency.
//
// Signed with CUSTOMER_SESSION_SECRET rather than a secret of its own so there
// is nothing new to configure. The "booking-manage:" prefix keeps these apart
// from session tokens, which sign a base64 JSON body and can never start with
// it. Rotating the secret does not strand anyone: a link whose signature no
// longer verifies falls back to the email lookup.
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string | null {
  return process.env.CUSTOMER_SESSION_SECRET || null;
}

function signature(bookingId: string, key: string): string {
  return createHmac("sha256", key).update(`booking-manage:${bookingId}`).digest("base64url");
}

// No expiry on purpose. The link has to keep working until the session, which
// can be months out, and a booking locks itself once its session starts.
export function signBookingToken(bookingId: string): string | null {
  const key = secret();
  return key ? signature(bookingId, key) : null;
}

export function verifyBookingToken(bookingId: string, token: string | null | undefined): boolean {
  const key = secret();
  if (!key || !token) return false;

  const given = Buffer.from(token);
  const expected = Buffer.from(signature(bookingId, key));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Either proof lets someone manage a booking: the signed link from their
// email, or the email address the booking was made with.
export function canManageBooking(
  booking: { id: string; email: string },
  proof: { email?: string | null; token?: string | null }
): boolean {
  if (verifyBookingToken(booking.id, proof.token)) return true;
  const email = proof.email?.trim().toLowerCase();
  return !!email && email === booking.email.trim().toLowerCase();
}

export function manageBookingPath(bookingId: string): string {
  const token = signBookingToken(bookingId);
  // Without a secret the link still lands on the right page, which then asks
  // for the booking email instead of failing.
  return `/book/manage?booking_id=${bookingId}${token ? `&t=${token}` : ""}`;
}

export function manageBookingUrl(bookingId: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com").replace(/\/+$/, "");
  return `${site}${manageBookingPath(bookingId)}`;
}
