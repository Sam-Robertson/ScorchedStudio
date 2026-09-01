// lib/accounting/encryption.ts — server-only
//
// AES-256-GCM for Plaid access tokens at rest (plaid_items.access_token_enc).
// App-code crypto, not Supabase pgsodium/vault — matches how this repo
// already handles secrets (lib/admin-session.ts signs sessions with HMAC in
// app code), and avoids a second key-management surface in the Supabase
// dashboard for a single column.
//
// Stored layout: iv (12 bytes) || authTag (16 bytes) || ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function key(): Buffer {
  const hex = process.env.PLAID_TOKEN_ENC_KEY;
  if (!hex) throw new Error("Missing PLAID_TOKEN_ENC_KEY");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("PLAID_TOKEN_ENC_KEY must be 32 bytes (64 hex chars) — generate with `openssl rand -hex 32`");
  }
  return buf;
}

export function encryptToken(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptToken(stored: Buffer): string {
  const iv = stored.subarray(0, IV_LENGTH);
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = stored.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// PostgREST (Supabase's REST layer) represents `bytea` columns as Postgres's
// hex output format — a string like "\x0102fe" — on both read and write.
// These convert to/from that wire format so callers only ever handle Buffers.
export function toPgBytea(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

export function fromPgBytea(pgHex: string): Buffer {
  return Buffer.from(pgHex.replace(/^\\x/, ""), "hex");
}
