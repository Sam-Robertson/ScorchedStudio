import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortEnrollmentState, cohortEnrollmentWindow, cohortFirstSessionDate, cohortLastSessionDate } from "./course-rules.ts";

// The Tuesday cohort that prompted this: still offering "Enroll" the day after
// its first session.
const tuesday = [
  { session_date: "2026-09-29" },
  { session_date: "2026-10-06" },
  { session_date: "2026-10-13" },
  { session_date: "2026-10-20" },
];

test("a cohort is open before its first session date", () => {
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-09-15T18:00:00Z")), "open");
});

test("a cohort stays open through the whole first session day in Denver", () => {
  // Noon Denver on the first day
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-09-29T18:00:00Z")), "open");
  // 9:30pm Denver on the first day, which is already Sep 30 in UTC
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-09-30T03:30:00Z")), "open");
  // 11:59pm Denver, the last open minute
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-09-30T05:59:00Z")), "open");
});

test("sign-ups close once the first session date has passed", () => {
  // Midnight Denver, the start of Sep 30
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-09-30T06:00:00Z")), "started");
  // The moment it was reported: 11:41pm Denver on Sep 30, already Oct 1 in UTC
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-10-01T05:41:00Z")), "started");
});

test("the cutoff follows Denver midnight on standard time too", () => {
  const december = [{ session_date: "2026-12-01" }, { session_date: "2026-12-08" }];
  // MST is UTC-7, so Dec 1 ends at 07:00Z
  assert.equal(cohortEnrollmentWindow(december, new Date("2026-12-02T06:59:00Z")), "open");
  assert.equal(cohortEnrollmentWindow(december, new Date("2026-12-02T07:00:00Z")), "started");
});

test("a cohort is started through its last session day and ended after it", () => {
  // 9pm Denver on the last day, Oct 21 in UTC
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-10-21T03:00:00Z")), "started");
  assert.equal(cohortEnrollmentWindow(tuesday, new Date("2026-10-21T06:00:00Z")), "ended");
});

test("the first date is the earliest session, not whichever is listed first", () => {
  const shuffled = [{ session_date: "2026-10-13" }, { session_date: "2026-09-29" }, { session_date: "2026-10-20" }];
  assert.equal(cohortFirstSessionDate(shuffled), "2026-09-29");
  assert.equal(cohortLastSessionDate(shuffled), "2026-10-20");
  assert.equal(cohortEnrollmentWindow(shuffled, new Date("2026-09-30T18:00:00Z")), "started");
});

test("a cohort with no sessions has no first date to pass", () => {
  assert.equal(cohortFirstSessionDate([]), null);
  assert.equal(cohortLastSessionDate([]), null);
  assert.equal(cohortEnrollmentWindow([], new Date("2026-10-01T18:00:00Z")), "open");
});

test("a cohort an admin marked completed or cancelled is over whatever its dates say", () => {
  const future = [{ session_date: "2099-01-05" }, { session_date: "2099-01-12" }];
  assert.equal(cohortEnrollmentState({ status: "completed" }, future), "ended");
  assert.equal(cohortEnrollmentState({ status: "cancelled" }, future), "ended");
  // "full" and "open" defer to the dates: full still takes waitlist joins.
  assert.equal(cohortEnrollmentState({ status: "full" }, future), "open");
  assert.equal(cohortEnrollmentState({ status: "open" }, future), "open");
});
