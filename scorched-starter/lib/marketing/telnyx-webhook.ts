// lib/marketing/telnyx-webhook.ts
//
// Ed25519 signature verification for Telnyx webhooks.
//
// Done with node's crypto rather than the `telnyx` SDK's webhooks.unwrap().
// The SDK helper reads TELNYX_PUBLIC_KEY from the environment itself and does
// not document a timestamp tolerance, and rejecting stale timestamps is the
// half that stops a captured webhook being replayed later. Doing both here
// keeps the whole rule visible and unit testable with no network and no env.
import { createPublicKey, verify as cryptoVerify } from "crypto";

export const SIGNATURE_HEADER = "telnyx-signature-ed25519";
export const TIMESTAMP_HEADER = "telnyx-timestamp";

// How far out of date a webhook may be. Telnyx does not publish a figure, so
// this matches the five minutes that Stripe and Svix both use: long enough to
// survive a slow retry, short enough that a captured request is not replayable
// an hour later.
export const DEFAULT_TOLERANCE_SECONDS = 300;

// Telnyx publishes the key as base64 of the raw 32 byte Ed25519 public key.
// Node will only import a structured key, so it is wrapped in the fixed SPKI
// prefix for Ed25519 (RFC 8410) before being handed over.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function publicKeyFromBase64(base64Key: string) {
  const raw = Buffer.from(base64Key, "base64");
  if (raw.length !== 32) {
    throw new Error(`Telnyx public key must decode to 32 bytes, got ${raw.length}`);
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing-key" | "missing-headers" | "bad-timestamp" | "stale" | "bad-signature" };

export type VerifyArgs = {
  // The exact bytes received. Parsing and re-serializing the JSON changes key
  // order and whitespace and breaks the signature.
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKeyBase64: string | undefined;
  toleranceSeconds?: number;
  now?: Date;
};

export function verifyTelnyxSignature(args: VerifyArgs): VerifyResult {
  if (!args.publicKeyBase64) return { ok: false, reason: "missing-key" };
  if (!args.signature || !args.timestamp) return { ok: false, reason: "missing-headers" };

  const sentAt = Number.parseInt(args.timestamp, 10);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "bad-timestamp" };

  const tolerance = args.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  // Absolute difference, so a webhook stamped in the future is rejected too.
  // Clock skew that large means something is wrong either way.
  if (Math.abs(nowSeconds - sentAt) > tolerance) return { ok: false, reason: "stale" };

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(args.signature, "base64");
    // An Ed25519 signature is always 64 bytes. Checking first means a garbage
    // header is rejected as a bad signature rather than throwing.
    if (signatureBytes.length !== 64) return { ok: false, reason: "bad-signature" };
  } catch {
    return { ok: false, reason: "bad-signature" };
  }

  try {
    const key = publicKeyFromBase64(args.publicKeyBase64);
    // Telnyx signs the timestamp and the body joined by a pipe.
    const signed = Buffer.from(`${args.timestamp}|${args.rawBody}`, "utf8");
    const valid = cryptoVerify(null, signed, key, signatureBytes);
    return valid ? { ok: true } : { ok: false, reason: "bad-signature" };
  } catch {
    return { ok: false, reason: "bad-signature" };
  }
}

// Only used by the tests, which need to produce a valid signature without a
// real Telnyx account. Kept here so the signed-string format is defined in
// exactly one place and the test cannot pass against a different format than
// the verifier uses.
export function signedPayload(timestamp: string, rawBody: string): Buffer {
  return Buffer.from(`${timestamp}|${rawBody}`, "utf8");
}
