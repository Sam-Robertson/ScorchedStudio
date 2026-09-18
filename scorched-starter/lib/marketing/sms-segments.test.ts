import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSms, costEstimate, estimateCost, segmentCount } from "./sms-segments.ts";

// These rules decide what a campaign costs. Getting them wrong understates the
// bill and, worse, tells the composer a message fits in one segment when the
// carrier will split and bill it as two.

test("plain ASCII uses GSM-7 and fits 160 in one segment", () => {
  const info = analyzeSms("a".repeat(160));
  assert.equal(info.encoding, "GSM-7");
  assert.equal(info.units, 160);
  assert.equal(info.segments, 1);
});

test("161 GSM-7 characters split at 153, not 160", () => {
  // Concatenated parts carry a header, so the usable size drops to 153.
  assert.equal(segmentCount("a".repeat(161)), 2);
  assert.equal(segmentCount("a".repeat(306)), 2);
  assert.equal(segmentCount("a".repeat(307)), 3);
});

test("an extended GSM-7 character costs two septets", () => {
  // The trap: 159 visible characters, but the euro sign is escape + character,
  // so it is 160 septets... and adding one more tips it over.
  const info = analyzeSms("a".repeat(159) + "€");
  assert.equal(info.encoding, "GSM-7");
  assert.equal(info.units, 161, "euro sign must count as two septets");
  assert.equal(info.segments, 2);
  assert.deepEqual(info.doubleWidth, ["€"]);
});

test("every extended character is flagged as double width", () => {
  for (const char of ["^", "{", "}", "\\", "[", "~", "]", "|", "€"]) {
    const info = analyzeSms(`hello ${char}`);
    assert.equal(info.encoding, "GSM-7", `${char} should stay in GSM-7`);
    assert.equal(info.units, 8, `${char} should cost two septets`);
    assert.deepEqual(info.doubleWidth, [char]);
  }
});

test("a single emoji forces UCS-2 and collapses the limit to 70", () => {
  const info = analyzeSms("Scorched Studio news 🔥");
  assert.equal(info.encoding, "UCS-2");
  assert.ok(info.forcedUcs2By.includes("🔥"));
  assert.equal(info.segments, 1);

  // A body that was comfortably one GSM-7 segment becomes two once an emoji
  // is added, which is the surprise the composer has to warn about.
  assert.equal(segmentCount("a".repeat(100)), 1);
  assert.equal(segmentCount("a".repeat(100) + "🔥"), 2);
});

test("UCS-2 splits at 70 then 67", () => {
  assert.equal(segmentCount("☃".repeat(70)), 1);
  assert.equal(segmentCount("☃".repeat(71)), 2);
  assert.equal(segmentCount("☃".repeat(134)), 2);
  assert.equal(segmentCount("☃".repeat(135)), 3);
});

test("a curly apostrophe pasted from a word processor forces UCS-2", () => {
  // The most common real cause, and invisible to the author: it looks like
  // an apostrophe but quadruples the cost of a long message.
  const straight = analyzeSms("Don't miss it");
  const curly = analyzeSms("Don’t miss it");

  assert.equal(straight.encoding, "GSM-7");
  assert.equal(curly.encoding, "UCS-2");
  assert.deepEqual(curly.forcedUcs2By, ["’"]);
});

test("accented characters in the GSM-7 set do not force UCS-2", () => {
  for (const char of ["é", "è", "à", "ä", "ö", "ñ", "ü", "£", "¥", "§"]) {
    assert.equal(analyzeSms(`hi ${char}`).encoding, "GSM-7", `${char} is in GSM-7`);
  }
});

test("newlines are GSM-7 and count as one septet", () => {
  const info = analyzeSms("line one\nline two");
  assert.equal(info.encoding, "GSM-7");
  assert.equal(info.units, 17);
});

test("an empty body is zero segments, not one", () => {
  assert.equal(segmentCount(""), 0);
  assert.equal(analyzeSms("").units, 0);
});

test("cost is per segment per recipient", () => {
  // A two segment message to 500 people is 1000 billable segments, which is
  // the number that actually lands on the invoice.
  const twoSegments = "a".repeat(200);
  assert.equal(segmentCount(twoSegments), 2);
  assert.equal(estimateCost(twoSegments, 0.004, 500), 4);
  assert.equal(estimateCost("short", 0.004, 1), 0.004);
});

test("the cost estimate carries everything the composer needs to warn", () => {
  const est = costEstimate("a".repeat(100) + "🔥", 0.004, 250);

  assert.equal(est.encoding, "UCS-2");
  assert.equal(est.segments, 2);
  assert.equal(est.recipients, 250);
  assert.equal(est.perMessage, 0.008);
  assert.equal(est.total, 2);
  assert.deepEqual(est.forcedUcs2By, ["🔥"]);
});

test("an emoji counts as two UCS-2 units, matching what carriers bill", () => {
  // Non-BMP code points are a surrogate pair, and UCS-2 limits are counted in
  // 16-bit units, so two is correct rather than an off-by-one.
  assert.equal(analyzeSms("🔥").units, 2);
  assert.equal(analyzeSms("🔥".repeat(35)).segments, 1); // 70 units exactly
  assert.equal(analyzeSms("🔥".repeat(36)).segments, 2);
});
