// lib/customer-password.ts — server-only
//
// scrypt via Node's built-in crypto, no new dependency (same reasoning as
// the HMAC-only approach in customer-session.ts/admin-session.ts). Stored
// as "<salt-hex>:<hash-hex>"; scrypt's own cost parameters are fixed here
// rather than encoded, since they've never changed.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuf = Buffer.from(hash, "hex");
  const candidateBuf = scryptSync(password, salt, KEY_LENGTH);
  if (hashBuf.length !== candidateBuf.length) return false;
  return timingSafeEqual(hashBuf, candidateBuf);
}
