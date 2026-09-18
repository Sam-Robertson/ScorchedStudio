import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isE164, formatPhoneForDisplay } from "./phone.ts";

// The reason this matters: subscribers.phone has a CHECK for E.164 and is the
// unique key SMS opt-outs are matched on. A number stored as "(801) 361-9066"
// would never match the "+18013619066" that arrives on an inbound STOP webhook,
// so that person could never opt out.

test("normalizes the local formats the booking and waiver forms actually collect", () => {
  const expected = "+18013619066";
  for (const input of [
    "8013619066",
    "801-361-9066",
    "(801) 361-9066",
    "801.361.9066",
    "801 361 9066",
    "+1 801 361 9066",
    "+18013619066",
    "1-801-361-9066",
    "  801-361-9066  ",
  ]) {
    assert.equal(normalizePhone(input), expected, `failed on ${JSON.stringify(input)}`);
  }
});

test("rejects rather than half-parses what cannot receive a text", () => {
  for (const input of [null, undefined, "", "   ", "abc", "555", "12345", "801-361-906"]) {
    assert.equal(normalizePhone(input), null, `should reject ${JSON.stringify(input)}`);
  }
});

test("keeps a non-US number in E.164 instead of forcing the default region", () => {
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
});

test("normalizePhone output always satisfies the database CHECK", () => {
  for (const input of ["8013619066", "+44 20 7946 0958", "(801) 361-9066"]) {
    const out = normalizePhone(input);
    assert.ok(out && isE164(out), `${input} produced non-E.164 ${out}`);
  }
});

test("isE164 rejects the formats that would fail the insert", () => {
  assert.ok(isE164("+18013619066"));
  assert.ok(!isE164("18013619066"));
  assert.ok(!isE164("(801) 361-9066"));
  assert.ok(!isE164("+0123456789"));
  assert.ok(!isE164(""));
});

test("display formatting never loses the number it could not format", () => {
  assert.equal(formatPhoneForDisplay("+18013619066"), "(801) 361-9066");
  assert.equal(formatPhoneForDisplay(null), "");
  // Junk in the column still renders as itself rather than vanishing from admin.
  assert.equal(formatPhoneForDisplay("not-a-number"), "not-a-number");
});
