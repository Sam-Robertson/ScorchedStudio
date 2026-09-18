import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  DEFAULT_TOLERANCE_SECONDS,
  publicKeyFromBase64,
  signedPayload,
  verifyTelnyxSignature,
} from "./telnyx-webhook.ts";

// A throwaway Ed25519 keypair standing in for Telnyx's, so the round trip is
// exercised for real rather than mocked. The public half is exported in the
// same raw-32-byte base64 form Telnyx publishes.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyBase64 = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(12) // strip the SPKI prefix to leave the raw 32 bytes
  .toString("base64");

function signAs(timestamp: string, body: string): string {
  return cryptoSign(null, signedPayload(timestamp, body), privateKey).toString("base64");
}

const BODY = JSON.stringify({
  data: { event_type: "message.received", payload: { id: "abc", text: "hello" } },
});

function nowSeconds(at = new Date()): string {
  return String(Math.floor(at.getTime() / 1000));
}

test("a genuine signature verifies", () => {
  const ts = nowSeconds();
  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: signAs(ts, BODY),
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: true });
});

test("a tampered body is rejected", () => {
  // The whole point: an attacker who captures a webhook cannot edit it. Here
  // the body claims a different sender than the one that was signed.
  const ts = nowSeconds();
  const signature = signAs(ts, BODY);

  const tampered = JSON.stringify({
    data: { event_type: "message.received", payload: { id: "abc", text: "STOP" } },
  });

  const result = verifyTelnyxSignature({
    rawBody: tampered,
    signature,
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "bad-signature" });
});

test("a signature from a different key is rejected", () => {
  const other = generateKeyPairSync("ed25519");
  const ts = nowSeconds();
  const forged = cryptoSign(null, signedPayload(ts, BODY), other.privateKey).toString("base64");

  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: forged,
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "bad-signature" });
});

test("the timestamp is part of what is signed, so it cannot be swapped", () => {
  // Re-stamping a captured webhook with a fresh timestamp to slip past the
  // staleness check must invalidate the signature.
  const originalTs = nowSeconds();
  const signature = signAs(originalTs, BODY);

  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature,
    timestamp: nowSeconds(new Date(Date.now() + 1000)),
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "bad-signature" });
});

test("a stale webhook is rejected even with a valid signature", () => {
  const then = new Date(Date.now() - (DEFAULT_TOLERANCE_SECONDS + 60) * 1000);
  const ts = nowSeconds(then);

  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: signAs(ts, BODY),
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "stale" });
});

test("a webhook just inside the tolerance is accepted", () => {
  const then = new Date(Date.now() - (DEFAULT_TOLERANCE_SECONDS - 30) * 1000);
  const ts = nowSeconds(then);

  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: signAs(ts, BODY),
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: true });
});

test("a timestamp far in the future is rejected too", () => {
  // Large skew in either direction means something is wrong; accepting future
  // stamps would let one captured webhook stay replayable indefinitely.
  const ahead = new Date(Date.now() + (DEFAULT_TOLERANCE_SECONDS + 60) * 1000);
  const ts = nowSeconds(ahead);

  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: signAs(ts, BODY),
    timestamp: ts,
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "stale" });
});

test("missing headers and missing key are distinguished", () => {
  const ts = nowSeconds();
  const signature = signAs(ts, BODY);

  assert.deepEqual(
    verifyTelnyxSignature({ rawBody: BODY, signature: null, timestamp: ts, publicKeyBase64 }),
    { ok: false, reason: "missing-headers" }
  );
  assert.deepEqual(
    verifyTelnyxSignature({ rawBody: BODY, signature, timestamp: null, publicKeyBase64 }),
    { ok: false, reason: "missing-headers" }
  );
  // An unconfigured deployment must refuse rather than accept everything.
  assert.deepEqual(
    verifyTelnyxSignature({ rawBody: BODY, signature, timestamp: ts, publicKeyBase64: undefined }),
    { ok: false, reason: "missing-key" }
  );
});

test("a non-numeric timestamp is rejected rather than treated as zero", () => {
  const result = verifyTelnyxSignature({
    rawBody: BODY,
    signature: signAs("123", BODY),
    timestamp: "not-a-number",
    publicKeyBase64,
  });
  assert.deepEqual(result, { ok: false, reason: "bad-timestamp" });
});

test("garbage in the signature header does not throw", () => {
  const ts = nowSeconds();
  for (const signature of ["", "not-base64!!", "YWJj"]) {
    const result = verifyTelnyxSignature({ rawBody: BODY, signature, timestamp: ts, publicKeyBase64 });
    assert.equal(result.ok, false);
  }
});

test("the real public key format Telnyx publishes imports cleanly", () => {
  // 32 raw bytes, base64 encoded. Node needs it wrapped in an SPKI header
  // first, which is the part most likely to be got wrong.
  assert.doesNotThrow(() => publicKeyFromBase64(publicKeyBase64));
  assert.throws(() => publicKeyFromBase64("dG9vc2hvcnQ="), /32 bytes/);
});

test("signature verification needs the exact bytes, not re-serialized JSON", () => {
  // Re-serializing changes whitespace and key order, which is why the route
  // verifies before parsing.
  const ts = nowSeconds();
  const signature = signAs(ts, BODY);
  const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);

  assert.notEqual(reserialized, BODY);
  assert.deepEqual(
    verifyTelnyxSignature({ rawBody: reserialized, signature, timestamp: ts, publicKeyBase64 }),
    { ok: false, reason: "bad-signature" }
  );
});
