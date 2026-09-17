import test from "node:test";
import assert from "node:assert/strict";
import { classifyInbound, isOptIn, isOptOut, normalizeInbound } from "./sms-keywords.ts";

// Carriers require STOP to work unconditionally. Missing one is how a number
// gets blocked, so matching is generous about punctuation and casing.

test("every carrier-mandated opt-out keyword is honoured", () => {
  for (const word of ["stop", "STOP", "Stop", "stopall", "unsubscribe", "cancel", "revoke", "end", "quit"]) {
    assert.ok(isOptOut(word), `${word} must opt out`);
  }
});

test("opt-out survives the punctuation and whitespace people actually send", () => {
  for (const input of ["STOP!", " stop ", "Stop.", "  STOP  ", "stop?", "“STOP”"]) {
    assert.ok(isOptOut(input), `${JSON.stringify(input)} must opt out`);
  }
});

test("'opt out' as two words is recognised", () => {
  assert.ok(isOptOut("opt out"));
  assert.ok(isOptOut("OPT OUT"));
  assert.ok(isOptOut("optout"));
  assert.ok(isOptOut("opt  out"));
});

test("a real question containing the word stop is not an opt-out", () => {
  // This is the expensive false positive: treating a customer question as an
  // opt-out silently drops the conversation and loses the customer.
  for (const input of [
    "can I stop by on Saturday?",
    "what time do you stop taking walk ins",
    "stop by tomorrow?",
    "do you ever stop doing the beginner class",
  ]) {
    assert.ok(!isOptOut(input), `${JSON.stringify(input)} is a question, not an opt-out`);
    assert.equal(classifyInbound(input), "other");
  }
});

test("START re-subscribes", () => {
  assert.ok(isOptIn("start"));
  assert.ok(isOptIn("START"));
  assert.ok(isOptIn("Start!"));
  assert.ok(isOptIn("unstop"));
});

test("HELP is classified separately so it is not forwarded as a question", () => {
  assert.equal(classifyInbound("help"), "help");
  assert.equal(classifyInbound("HELP"), "help");
  assert.equal(classifyInbound("info"), "help");
});

test("anything else is a real message for a human", () => {
  assert.equal(classifyInbound("do you have openings this weekend?"), "other");
  assert.equal(classifyInbound("thanks!"), "other");
  assert.equal(classifyInbound(""), "other");
  assert.equal(classifyInbound(null), "other");
  assert.equal(classifyInbound(undefined), "other");
});

test("normalization strips punctuation but keeps word boundaries", () => {
  assert.equal(normalizeInbound("  STOP!  "), "stop");
  assert.equal(normalizeInbound("Opt   Out."), "opt out");
  assert.equal(normalizeInbound(null), "");
});
