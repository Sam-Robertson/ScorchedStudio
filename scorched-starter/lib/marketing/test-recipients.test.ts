import test from "node:test";
import assert from "node:assert/strict";
import { isTestRecipient, testRecipients } from "./config.ts";

// The allowlist is what lets a campaign be proofread in a real inbox while
// MARKETING_LIVE is still off. It has to be exact: anything it wrongly matches
// is a message sent to a real person from a system that is supposed to be
// switched off.

function withEnv(value: string | undefined, fn: () => void) {
  const before = process.env.MARKETING_TEST_RECIPIENTS;
  if (value === undefined) delete process.env.MARKETING_TEST_RECIPIENTS;
  else process.env.MARKETING_TEST_RECIPIENTS = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.MARKETING_TEST_RECIPIENTS;
    else process.env.MARKETING_TEST_RECIPIENTS = before;
  }
}

test("an unset allowlist matches nobody", () => {
  withEnv(undefined, () => {
    assert.deepEqual(testRecipients(), []);
    assert.equal(isTestRecipient("sam@example.com"), false);
    assert.equal(isTestRecipient("+18015550123"), false);
  });
});

test("an empty allowlist matches nobody, including empty input", () => {
  withEnv("", () => {
    assert.equal(isTestRecipient(""), false);
    assert.equal(isTestRecipient("anyone@example.com"), false);
  });
});

test("emails match case-insensitively and ignore surrounding space", () => {
  withEnv(" Sam@Example.com , other@example.com ", () => {
    assert.ok(isTestRecipient("sam@example.com"));
    assert.ok(isTestRecipient("SAM@EXAMPLE.COM"));
    assert.ok(isTestRecipient("other@example.com"));
    assert.equal(isTestRecipient("someone-else@example.com"), false);
  });
});

test("phone numbers match on digits, whatever the formatting", () => {
  // The env may hold a number typed any way; the form sends E.164.
  withEnv("(801) 555-0123", () => {
    assert.ok(isTestRecipient("+18015550123"));
    assert.ok(isTestRecipient("801-555-0123"));
    assert.ok(isTestRecipient("8015550123"));
    assert.equal(isTestRecipient("+18015550124"), false);
  });
});

test("a short numeric string cannot match a phone entry", () => {
  // Guards the digit comparison: without a length floor, stripping non-digits
  // from two unrelated values could leave two empty strings that compare equal.
  withEnv("+18015550123", () => {
    assert.equal(isTestRecipient("123"), false);
    assert.equal(isTestRecipient("nobody@example.com"), false);
    assert.equal(isTestRecipient("---"), false);
  });
});

test("an email entry never matches a phone, and the reverse", () => {
  withEnv("sam@example.com", () => {
    assert.equal(isTestRecipient("+18015550123"), false);
  });
  withEnv("+18015550123", () => {
    assert.equal(isTestRecipient("sam@example.com"), false);
  });
});

test("a mixed allowlist handles both kinds at once", () => {
  withEnv("sam@example.com,+18015550123", () => {
    assert.ok(isTestRecipient("sam@example.com"));
    assert.ok(isTestRecipient("+1 801 555 0123"));
    assert.equal(isTestRecipient("someone@example.com"), false);
  });
});
