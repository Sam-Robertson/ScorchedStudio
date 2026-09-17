import test from "node:test";
import assert from "node:assert/strict";
import {
  backoffMs,
  isRetryableError,
  mapSendblueStatus,
  MAX_ATTEMPTS,
  SENDBLUE_STATUSES,
  shouldAdvanceStatus,
} from "./sms-status.ts";

test("every status Sendblue documents maps to a queue status", () => {
  // Sendblue reports eight, not the five the original spec listed. An
  // unmapped one would leave a queue row stuck in 'sending' forever.
  for (const status of SENDBLUE_STATUSES) {
    assert.ok(mapSendblueStatus(status), `${status} is unmapped`);
  }
});

test("in-flight statuses are distinguished from terminal ones", () => {
  for (const s of ["REGISTERED", "PENDING", "QUEUED", "ACCEPTED"]) {
    assert.equal(mapSendblueStatus(s), "sending");
  }
  assert.equal(mapSendblueStatus("SENT"), "sent");
  assert.equal(mapSendblueStatus("DELIVERED"), "delivered");
  assert.equal(mapSendblueStatus("ERROR"), "failed");
  assert.equal(mapSendblueStatus("DECLINED"), "failed");
});

test("status matching is case and whitespace tolerant", () => {
  assert.equal(mapSendblueStatus("delivered"), "delivered");
  assert.equal(mapSendblueStatus("  Delivered  "), "delivered");
});

test("an unknown status maps to null rather than a wrong guess", () => {
  assert.equal(mapSendblueStatus("SOMETHING_NEW"), null);
  assert.equal(mapSendblueStatus(null), null);
  assert.equal(mapSendblueStatus(""), null);
});

test("a late callback cannot undo a delivery", () => {
  // Callbacks arrive out of order. A QUEUED landing after DELIVERED must not
  // drag the row backwards and make the campaign stats lie.
  assert.ok(!shouldAdvanceStatus("delivered", "sending"));
  assert.ok(!shouldAdvanceStatus("delivered", "sent"));
  assert.ok(!shouldAdvanceStatus("delivered", "failed"));
});

test("status advances forward normally", () => {
  assert.ok(shouldAdvanceStatus("pending", "sending"));
  assert.ok(shouldAdvanceStatus("sending", "sent"));
  assert.ok(shouldAdvanceStatus("sent", "delivered"));
  assert.ok(shouldAdvanceStatus("sending", "failed"));
});

test("a repeated callback is a no-op", () => {
  assert.ok(!shouldAdvanceStatus("delivered", "delivered"));
  assert.ok(!shouldAdvanceStatus("sent", "sent"));
});

test("a skipped row is never revived by a stray callback", () => {
  // Skipped means we deliberately did not send, usually because the person
  // opted out between enqueue and send.
  assert.ok(!shouldAdvanceStatus("skipped", "sent"));
  assert.ok(!shouldAdvanceStatus("skipped", "delivered"));
});

test("rate limiting and provider faults are retryable", () => {
  assert.ok(isRetryableError("4001"));
  assert.ok(isRetryableError("5509"));
  assert.ok(isRetryableError("5000"));
  assert.ok(isRetryableError(null, 429));
  assert.ok(isRetryableError(null, 500));
  assert.ok(isRetryableError(null, 503));
});

test("validation and blacklist errors are not retried", () => {
  // Retrying these burns the new-contact budget on something that will fail
  // identically every time.
  assert.ok(!isRetryableError("4000"));
  assert.ok(!isRetryableError("4002"));
  assert.ok(!isRetryableError("10001"));
  assert.ok(!isRetryableError(null, 400));
  assert.ok(!isRetryableError(null));
});

test("backoff grows and then stops growing", () => {
  assert.equal(backoffMs(1), 5 * 60 * 1000);
  assert.equal(backoffMs(2), 10 * 60 * 1000);
  assert.equal(backoffMs(3), 20 * 60 * 1000);
  assert.ok(backoffMs(4) > backoffMs(3));
  // Capped, so a persistently failing row does not get scheduled for next year.
  assert.equal(backoffMs(99), 6 * 60 * 60 * 1000);
});

test("attempts are bounded", () => {
  assert.equal(MAX_ATTEMPTS, 5);
});
