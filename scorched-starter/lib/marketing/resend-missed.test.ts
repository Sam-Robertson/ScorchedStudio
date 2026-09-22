import test from "node:test";
import assert from "node:assert/strict";
import { missedRecipients } from "./resend-missed.ts";
import type { SubscriberRecord } from "../supabase.ts";

const sub = (email: string | null) => ({ email } as SubscriberRecord);

test("everyone the provider already accepted is left out", () => {
  const audience = [sub("a@x.com"), sub("b@x.com"), sub("c@x.com")];
  const left = missedRecipients(audience, ["a@x.com", "c@x.com"]);
  assert.deepEqual(left.map((s) => s.email), ["b@x.com"]);
});

test("email matching ignores case and whitespace", () => {
  const audience = [sub("Sam@Example.com"), sub("b@x.com")];
  const left = missedRecipients(audience, [" sam@example.com "]);
  assert.deepEqual(left.map((s) => s.email), ["b@x.com"]);
});

test("a subscriber with no email address is never a recipient", () => {
  assert.deepEqual(missedRecipients([sub(null)], []), []);
});

test("nothing accepted means the whole audience is missed", () => {
  const audience = [sub("a@x.com"), sub("b@x.com")];
  assert.equal(missedRecipients(audience, []).length, 2);
});
