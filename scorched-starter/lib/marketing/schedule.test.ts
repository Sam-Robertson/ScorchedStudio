import test from "node:test";
import assert from "node:assert/strict";
import { checkSchedule, formatScheduled, isoToLocalInput, localInputToIso } from "./schedule.ts";

const now = new Date("2026-09-22T20:00:00Z");

test("a draft can be scheduled for later", () => {
  const r = checkSchedule("draft", "2026-09-23T15:00:00Z", now);
  assert.equal(r.ok, true);
});

test("a time in the past is rejected", () => {
  const r = checkSchedule("draft", "2026-09-22T19:00:00Z", now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /5 minutes/);
});

test("a time inside the cron interval is rejected, one just outside is fine", () => {
  assert.equal(checkSchedule("draft", "2026-09-22T20:04:00Z", now).ok, false);
  assert.equal(checkSchedule("draft", "2026-09-22T20:05:00Z", now).ok, true);
});

test("an empty or garbage time is rejected with a readable message", () => {
  const empty = checkSchedule("draft", null, now);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.error, /Pick a date/);
  const junk = checkSchedule("draft", "next tuesday", now);
  assert.equal(junk.ok, false);
});

test("a sent or cancelled campaign cannot be scheduled", () => {
  assert.equal(checkSchedule("sent", "2026-09-23T15:00:00Z", now).ok, false);
  assert.equal(checkSchedule("cancelled", "2026-09-23T15:00:00Z", now).ok, false);
  assert.equal(checkSchedule("sending", "2026-09-23T15:00:00Z", now).ok, false);
});

test("a scheduled campaign can be rescheduled and a paused one scheduled to resume", () => {
  assert.equal(checkSchedule("scheduled", "2026-09-23T15:00:00Z", now).ok, true);
  assert.equal(checkSchedule("paused", "2026-09-23T15:00:00Z", now).ok, true);
});

test("the datetime-local input round-trips through ISO", () => {
  const iso = localInputToIso("2026-09-23T09:00");
  assert.ok(iso);
  assert.equal(isoToLocalInput(iso), "2026-09-23T09:00");
});

test("empty input values map to nothing rather than an invalid date", () => {
  assert.equal(localInputToIso(""), null);
  assert.equal(isoToLocalInput(null), "");
  assert.equal(isoToLocalInput("not a date"), "");
  assert.equal(formatScheduled(null), "");
});

test("display is always in the studio's zone", () => {
  // 15:00 UTC in September is 9:00 AM Mountain Daylight Time.
  assert.equal(formatScheduled("2026-09-23T15:00:00Z"), "Wed, Sep 23 at 9:00 AM");
});
