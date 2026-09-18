import test from "node:test";
import assert from "node:assert/strict";
import {
  describeSegment,
  isSendableEmailStatus,
  isSendableSmsStatus,
  segmentMatches,
} from "./segment.ts";

test("a segment with no tags reaches everyone subscribed on the channel", () => {
  assert.ok(segmentMatches(undefined, { tags: [] }));
  assert.ok(segmentMatches(null, { tags: ["orem"] }));
  assert.ok(segmentMatches({}, { tags: ["orem"] }));
  assert.ok(segmentMatches({ tags: [] }, { tags: [] }));
});

test("'any' matches a subscriber carrying at least one listed tag", () => {
  const seg = { tags: ["orem", "slc"], match: "any" as const };
  assert.ok(segmentMatches(seg, { tags: ["orem"] }));
  assert.ok(segmentMatches(seg, { tags: ["slc", "course-interest"] }));
  assert.ok(!segmentMatches(seg, { tags: ["course-interest"] }));
  assert.ok(!segmentMatches(seg, { tags: [] }));
});

test("'all' requires every listed tag", () => {
  const seg = { tags: ["orem", "course-interest"], match: "all" as const };
  assert.ok(segmentMatches(seg, { tags: ["orem", "course-interest", "legacy-sms"] }));
  assert.ok(!segmentMatches(seg, { tags: ["orem"] }));
  assert.ok(!segmentMatches(seg, { tags: ["course-interest"] }));
});

test("match defaults to 'any' when the stored segment omits it", () => {
  assert.ok(segmentMatches({ tags: ["orem", "slc"] }, { tags: ["slc"] }));
});

test("only an explicit subscribed status is sendable", () => {
  assert.ok(isSendableEmailStatus("subscribed"));
  for (const s of ["unsubscribed", "bounced", "complained", "none"]) {
    assert.ok(!isSendableEmailStatus(s), `${s} must not be sendable`);
  }

  assert.ok(isSendableSmsStatus("subscribed"));
  for (const s of ["unsubscribed", "invalid", "none"]) {
    assert.ok(!isSendableSmsStatus(s), `${s} must not be sendable`);
  }
});

test("the confirm dialog gets words rather than raw segment JSON", () => {
  assert.equal(describeSegment({}), "everyone subscribed on this channel");
  assert.equal(describeSegment({ tags: ["orem"] }), "subscribers tagged orem");
  assert.equal(
    describeSegment({ tags: ["orem", "slc"], match: "any" }),
    "subscribers tagged orem or slc"
  );
  assert.equal(
    describeSegment({ tags: ["orem", "course-interest"], match: "all" }),
    "subscribers tagged orem and course-interest"
  );
});
