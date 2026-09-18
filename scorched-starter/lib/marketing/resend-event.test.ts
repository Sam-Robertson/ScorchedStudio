import test from "node:test";
import assert from "node:assert/strict";
import { resendEventFrom } from "./resend-event.ts";

type Event = { type?: string; data?: { email_id?: string } };

// The bug this guards: svix's verify() throws on a bad signature and returns
// undefined on a good one. Treating its return value as the event meant every
// genuine webhook crashed with an empty 500, while forged ones were correctly
// rejected, so the endpoint looked healthy from the outside and silently
// recorded nothing.

test("falls back to the raw body when verify returns undefined", () => {
  const raw = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const e = resendEventFrom<Event>(undefined, raw);

  assert.equal(e.type, "email.delivered");
  assert.equal(e.data?.email_id, "abc");
});

test("uses the parsed object when a version of svix does return one", () => {
  const parsed = { type: "email.bounced", data: { email_id: "xyz" } };
  const e = resendEventFrom<Event>(parsed, "{}");

  assert.equal(e.type, "email.bounced");
  assert.equal(e.data?.email_id, "xyz");
});

test("null and empty-string returns fall through to the body", () => {
  const raw = JSON.stringify({ type: "email.opened" });
  assert.equal(resendEventFrom<Event>(null, raw).type, "email.opened");
  assert.equal(resendEventFrom<Event>("", raw).type, "email.opened");
});

test("an unparseable body throws rather than yielding a broken event", () => {
  // The route catches this and answers 400. Returning a half-built object
  // would put us back where we started: a handler reading .type off nothing.
  assert.throws(() => resendEventFrom<Event>(undefined, "not json"));
});
