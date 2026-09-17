import test from "node:test";
import assert from "node:assert/strict";
import { isQuietHour, denverHour, nextSendWindowStart } from "./quiet-hours.ts";

// The bug this guards against: the configured window (20 to 9) wraps midnight.
// A naive `hour >= start && hour < end` predicate is false for every hour, so
// it would send at 3am and never send during the day.

test("the default window wraps midnight and covers the whole night", () => {
  const quiet = (h: number) => isQuietHour(h, 20, 9);

  for (const h of [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.ok(quiet(h), `${h}:00 should be quiet`);
  }
  for (const h of [9, 10, 12, 15, 18, 19]) {
    assert.ok(!quiet(h), `${h}:00 should be sendable`);
  }
});

test("the boundary hours land on the right side", () => {
  // 8pm is the first quiet hour, 9am is the first sendable one.
  assert.ok(isQuietHour(20, 20, 9));
  assert.ok(isQuietHour(8, 20, 9));
  assert.ok(!isQuietHour(9, 20, 9));
  assert.ok(!isQuietHour(19, 20, 9));
});

test("a non-wrapping window still works", () => {
  // Someone could configure a daytime blackout, e.g. quiet from 1am to 6am.
  const quiet = (h: number) => isQuietHour(h, 1, 6);
  assert.ok(quiet(1));
  assert.ok(quiet(5));
  assert.ok(!quiet(6));
  assert.ok(!quiet(0));
  assert.ok(!quiet(23));
});

test("start equal to end means no quiet period at all", () => {
  for (let h = 0; h < 24; h++) {
    assert.ok(!isQuietHour(h, 0, 0), `${h} should be sendable`);
  }
});

test("the hour is read in Denver time, not UTC", () => {
  // 2026-09-18T02:30:00Z is 8:30pm on the 17th in Denver (MDT, UTC-6), which
  // is inside quiet hours even though the UTC hour (2) suggests the middle of
  // the night on a different day.
  const instant = new Date("2026-09-18T02:30:00Z");
  assert.equal(denverHour(instant), 20);
  assert.ok(isQuietHour(denverHour(instant), 20, 9));
});

test("the hour is right on the other side of daylight saving too", () => {
  // January, so Denver is MST (UTC-7). 03:30Z is 8:30pm the previous evening.
  const instant = new Date("2026-01-15T03:30:00Z");
  assert.equal(denverHour(instant), 20);
});

test("midnight in Denver reads as hour 0, not 24", () => {
  // 2026-09-18T06:30:00Z is 12:30am Denver (MDT). Intl can render this as
  // "24" in some environments, which would break every comparison.
  assert.equal(denverHour(new Date("2026-09-18T06:30:00Z")), 0);
});

test("deferred messages are scheduled for when the window actually lifts", () => {
  // 10pm Denver on the 17th: quiet. The next send window opens at 9am on the 18th.
  const night = new Date("2026-09-18T04:00:00Z");
  const next = nextSendWindowStart(20, 9, night);

  assert.ok(next > night, "must be in the future");
  assert.equal(denverHour(next), 9);
});

test("a time already inside the send window is not pushed back", () => {
  const noon = new Date("2026-09-17T18:00:00Z"); // 12pm Denver
  assert.equal(nextSendWindowStart(20, 9, noon).getTime(), noon.getTime());
});
