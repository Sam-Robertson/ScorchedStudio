import test from "node:test";
import assert from "node:assert/strict";
import { chunk, unsubscribeHeaders, unsubscribeUrlFor } from "./email-headers.ts";

test("the unsubscribe URL carries the subscriber's own token", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://scorchedstudio.com";
  assert.equal(unsubscribeUrlFor("abc123"), "https://scorchedstudio.com/unsubscribe/abc123");
});

test("a trailing slash on the site URL does not produce a double slash", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://scorchedstudio.com/";
  assert.equal(unsubscribeUrlFor("abc123"), "https://scorchedstudio.com/unsubscribe/abc123");
});

test("one-click unsubscribe headers are exactly what RFC 8058 requires", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://scorchedstudio.com";
  const headers = unsubscribeHeaders("tok");

  // Gmail and Yahoo reject or spam-folder bulk mail without these, and the
  // angle brackets are part of the spec, not decoration.
  assert.equal(headers["List-Unsubscribe"], "<https://scorchedstudio.com/unsubscribe/tok>");
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("two subscribers never share an unsubscribe link", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://scorchedstudio.com";
  assert.notEqual(unsubscribeUrlFor("token-a"), unsubscribeUrlFor("token-b"));
});

test("batching never drops or duplicates a recipient", () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  const batches = chunk(items, 100);

  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(batches.flat(), items);
});

test("batching handles the exact-multiple and empty cases", () => {
  assert.equal(chunk([1, 2, 3, 4], 2).length, 2);
  assert.deepEqual(chunk([], 100), []);
  assert.deepEqual(chunk([1], 100), [[1]]);
});

test("a zero batch size fails loudly instead of looping forever", () => {
  assert.throws(() => chunk([1, 2, 3], 0), /at least 1/);
});
