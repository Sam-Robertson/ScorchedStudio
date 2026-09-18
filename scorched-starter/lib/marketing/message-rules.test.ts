import test from "node:test";
import assert from "node:assert/strict";
import {
  hasBusinessName,
  hasStopNotice,
  segmentCount,
  validateSmsBody,
  withStopNotice,
} from "./message-rules.ts";

test("the opt-out notice is appended when the author did not write one", () => {
  const out = withStopNotice("Scorched Studio: new classes just dropped");
  assert.match(out, /Reply STOP to opt out$/);
});

test("an existing opt-out notice is not duplicated", () => {
  for (const body of [
    "Scorched Studio: classes are up. Reply STOP to opt out",
    "Scorched Studio: classes are up. reply stop to opt out",
    "Scorched Studio: classes are up. Reply STOP to unsubscribe",
  ]) {
    const out = withStopNotice(body);
    const occurrences = out.toLowerCase().split("stop").length - 1;
    assert.equal(occurrences, 1, `duplicated the notice in: ${out}`);
  }
});

test("the appended notice is punctuated sensibly either way", () => {
  assert.equal(
    withStopNotice("Scorched Studio news!"),
    "Scorched Studio news! Reply STOP to opt out"
  );
  assert.equal(
    withStopNotice("Scorched Studio news"),
    "Scorched Studio news. Reply STOP to opt out"
  );
});

test("an empty body stays empty rather than becoming a bare STOP notice", () => {
  assert.equal(withStopNotice(""), "");
  assert.equal(withStopNotice("   "), "");
});

test("segment counting matches how carriers actually bill", () => {
  assert.equal(segmentCount(""), 0);
  assert.equal(segmentCount("a"), 1);
  assert.equal(segmentCount("a".repeat(160)), 1);
  // Past 160 the message is split and each part carries a header, leaving 153.
  assert.equal(segmentCount("a".repeat(161)), 2);
  assert.equal(segmentCount("a".repeat(306)), 2);
  assert.equal(segmentCount("a".repeat(307)), 3);
});

test("a campaign that does not name the business is blocked", () => {
  const issues = validateSmsBody("New classes just dropped, come see us");
  const errors = issues.filter((i) => i.level === "error");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /name the business/);
});

test("naming the business clears the error whatever the casing", () => {
  assert.ok(hasBusinessName("come to scorched studio"));
  assert.ok(hasBusinessName("SCORCHED STUDIO news"));
  const issues = validateSmsBody("Scorched Studio: new classes just dropped");
  assert.equal(issues.filter((i) => i.level === "error").length, 0);
});

test("going multi-part warns but does not block", () => {
  const long = "Scorched Studio: " + "a".repeat(200);
  const issues = validateSmsBody(long);

  assert.equal(issues.filter((i) => i.level === "error").length, 0);
  const warnings = issues.filter((i) => i.level === "warning");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /2 segments/);
});

test("an emoji is called out as the reason the cost jumped", () => {
  // The author cannot see why a short message became two segments unless the
  // warning names the character responsible.
  const issues = validateSmsBody("Scorched Studio: classes are up 🔥");
  const warnings = issues.filter((i) => i.level === "warning");

  assert.ok(warnings.some((w) => w.message.includes("🔥")));
  assert.ok(warnings.some((w) => /UCS-2/.test(w.message)));
  assert.equal(issues.filter((i) => i.level === "error").length, 0, "an emoji must not block the send");
});

test("a GSM-7 extended character is called out as double width", () => {
  const issues = validateSmsBody("Scorched Studio: 50% off {today}");
  const warnings = issues.filter((i) => i.level === "warning");
  assert.ok(warnings.some((w) => /count as two characters/.test(w.message)));
});

test("the length warning counts the appended STOP notice too", () => {
  // Just under 160 on its own, but over once the required notice is added,
  // which is exactly the case an author would otherwise be surprised by.
  const body = "Scorched Studio: " + "a".repeat(130);
  assert.ok(body.length <= 160);
  assert.ok(withStopNotice(body).length > 160);
  assert.equal(validateSmsBody(body).filter((i) => i.level === "warning").length, 1);
});

test("an empty body is an error, not a silent pass", () => {
  const issues = validateSmsBody("   ");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "error");
});

test("hasStopNotice recognises the phrasings an author might reasonably use", () => {
  assert.ok(hasStopNotice("Reply STOP to opt out"));
  assert.ok(hasStopNotice("reply stop to cancel"));
  assert.ok(hasStopNotice("Text STOP to unsubscribe"));
  assert.ok(!hasStopNotice("come see us before we stop for the season"));
});
