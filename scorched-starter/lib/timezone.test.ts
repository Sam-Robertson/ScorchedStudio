import { test } from "node:test";
import assert from "node:assert/strict";
import { todayInDenverYmd, denverDayRangeUTC } from "./timezone.ts";

// The bug these guard against: the UTC date rolls over at 6pm Denver (MDT) or
// 5pm (MST), so a UTC-derived "today" reads as tomorrow for the studio's whole
// evening. That blocked same-day booking every night the studio was open.
test("Denver date stays on the current day through the evening (MDT)", () => {
  // 2026-09-09 8:15pm Denver, which is already 2026-09-10 in UTC
  assert.equal(todayInDenverYmd(new Date("2026-09-10T02:15:00Z")), "2026-09-09");
  // 6:01pm Denver, one minute past the UTC rollover
  assert.equal(todayInDenverYmd(new Date("2026-09-10T00:01:00Z")), "2026-09-09");
  // Midday, where UTC and Denver agree
  assert.equal(todayInDenverYmd(new Date("2026-09-10T18:00:00Z")), "2026-09-10");
});

test("Denver date stays on the current day through the evening (MST)", () => {
  // 5:01pm Denver in January: the rollover is an hour earlier on standard time
  assert.equal(todayInDenverYmd(new Date("2026-01-15T00:01:00Z")), "2026-01-14");
  assert.equal(todayInDenverYmd(new Date("2026-01-15T18:00:00Z")), "2026-01-15");
});

test("denverDayRangeUTC brackets a real Denver day in both offsets", () => {
  // MDT: UTC-6, so the day runs 06:00Z to 06:00Z
  const summer = denverDayRangeUTC("2026-09-09");
  assert.equal(summer.startUTC, "2026-09-09T06:00:00.000Z");
  assert.equal(summer.endUTC, "2026-09-10T06:00:00.000Z");

  // MST: UTC-7, so the day runs 07:00Z to 07:00Z
  const winter = denverDayRangeUTC("2026-01-14");
  assert.equal(winter.startUTC, "2026-01-14T07:00:00.000Z");
  assert.equal(winter.endUTC, "2026-01-15T07:00:00.000Z");

  // The 8:15pm waiver that a "To: Sep 9" filter used to drop
  const evening = new Date("2026-09-10T02:15:00Z");
  assert.ok(evening >= new Date(summer.startUTC) && evening < new Date(summer.endUTC));
});
