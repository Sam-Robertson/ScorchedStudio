import test from "node:test";
import assert from "node:assert/strict";
import {
  isNewContact,
  mergeEmailStatus,
  mergeSmsStatus,
  nextEmailStatus,
  nextSmsStatus,
} from "./consent-rules.ts";

test("an opt-in subscribes, an opt-out unsubscribes", () => {
  assert.equal(nextEmailStatus("none", true, "footer_form"), "subscribed");
  assert.equal(nextEmailStatus(null, true, "waiver"), "subscribed");
  assert.equal(nextEmailStatus("subscribed", false, "unsubscribe_link"), "unsubscribed");
});

test("a previously unsubscribed or bounced address can opt back in", () => {
  assert.equal(nextEmailStatus("unsubscribed", true, "footer_form"), "subscribed");
  assert.equal(nextEmailStatus("bounced", true, "booking"), "subscribed");
});

test("a spam complaint is not undone by someone ticking a box again", () => {
  // Mailing a complainer again is how the sending domain gets blocked, so a
  // form submission must not be able to revive one.
  assert.equal(nextEmailStatus("complained", true, "footer_form"), "complained");
  assert.equal(nextEmailStatus("complained", true, "waiver"), "complained");
  assert.equal(nextEmailStatus("complained", true, "import_legacy_sms"), "complained");
  // An admin doing it deliberately is the one exception.
  assert.equal(nextEmailStatus("complained", true, "admin"), "subscribed");
});

test("an SMS opt-in clears a carrier-invalid number but an opt-out always wins", () => {
  assert.equal(nextSmsStatus("invalid", true), "subscribed");
  assert.equal(nextSmsStatus("unsubscribed", true), "subscribed");
  assert.equal(nextSmsStatus("subscribed", false), "unsubscribed");
});

test("merging two rows for one person keeps the opt-out", () => {
  // Someone who unsubscribed by email years ago and later gave us a phone
  // number must not come back subscribed just because the rows joined up.
  assert.equal(mergeEmailStatus("subscribed", "unsubscribed"), "unsubscribed");
  assert.equal(mergeEmailStatus("unsubscribed", "subscribed"), "unsubscribed");
  assert.equal(mergeEmailStatus("subscribed", "complained"), "complained");
  // Complained outranks unsubscribed: the strongest signal survives.
  assert.equal(mergeEmailStatus("unsubscribed", "complained"), "complained");
  assert.equal(mergeEmailStatus("subscribed", "none"), "subscribed");
  assert.equal(mergeEmailStatus("none", "none"), "none");
});

test("merging SMS status is pessimistic in the same way", () => {
  assert.equal(mergeSmsStatus("subscribed", "unsubscribed"), "unsubscribed");
  assert.equal(mergeSmsStatus("invalid", "subscribed"), "invalid");
  assert.equal(mergeSmsStatus("subscribed", "none"), "subscribed");
  assert.equal(mergeSmsStatus("none", "none"), "none");
});

test("a new contact is anyone with no conversation inside the 30 day window", () => {
  const now = new Date("2026-09-17T12:00:00Z");

  // Never contacted at all.
  assert.equal(isNewContact(null, now), true);
  // Contacted 40 days ago: the window has lapsed, so they count as new again.
  assert.equal(isNewContact("2026-08-08T12:00:00Z", now), true);
  // Contacted 5 days ago: established, so they cost nothing from the budget.
  assert.equal(isNewContact("2026-09-12T12:00:00Z", now), false);
});

test("the new-contact boundary does not drift by a day either side", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  // Exactly 30 days is still inside the window.
  assert.equal(isNewContact("2026-08-18T12:00:00Z", now), false);
  // One minute past 30 days is outside it.
  assert.equal(isNewContact("2026-08-18T11:59:00Z", now), true);
});

test("an unparseable timestamp is treated as new rather than as established", () => {
  // Guessing "established" would spend no budget and could burst past the
  // new-contact cap, which is the expensive mistake; guessing "new" only
  // slows the drip down.
  assert.equal(isNewContact("not-a-date"), true);
});
