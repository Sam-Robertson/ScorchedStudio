// lib/accounting/encryption.test.ts
// Run with: node --test lib/accounting/encryption.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.PLAID_TOKEN_ENC_KEY = randomBytes(32).toString("hex");

const { encryptToken, decryptToken } = await import("./encryption.ts");

test("round-trips a token", () => {
  const plaintext = "access-sandbox-abc123-def456";
  const stored = encryptToken(plaintext);
  assert.equal(decryptToken(stored), plaintext);
});

test("ciphertext is not the plaintext and varies per call (random IV)", () => {
  const plaintext = "access-sandbox-abc123-def456";
  const a = encryptToken(plaintext);
  const b = encryptToken(plaintext);
  assert.notEqual(a.toString("hex"), plaintext);
  assert.notEqual(a.toString("hex"), b.toString("hex"));
  assert.equal(decryptToken(a), plaintext);
  assert.equal(decryptToken(b), plaintext);
});

test("tampered ciphertext fails to decrypt", () => {
  const stored = encryptToken("access-sandbox-abc123-def456");
  const tampered = Buffer.from(stored);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => decryptToken(tampered));
});
