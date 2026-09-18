import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateThroughputCompletion,
  maxMessagesPerRun,
  sendingHoursPerDay,
} from "./sms-budget.ts";

test("one run may send the sustained rate times the cron interval", () => {
  // SMS_MAX_PER_MINUTE is a rate, and the cron fires every 5 minutes. Treating
  // it as a per-run figure would deliver a fifth of what the setting promises.
  assert.equal(maxMessagesPerRun(12), 60);
  assert.equal(maxMessagesPerRun(12, 5), 60);
  assert.equal(maxMessagesPerRun(1, 5), 5);
  assert.equal(maxMessagesPerRun(0), 0);
});

test("quiet hours cut the sendable day, and the estimate has to know it", () => {
  // The default 20 to 9 window leaves 11 hours, not 24. Ignoring it would
  // overstate throughput by more than double.
  assert.equal(sendingHoursPerDay(20, 9), 11);
  assert.equal(sendingHoursPerDay(1, 6), 19);
  assert.equal(sendingHoursPerDay(0, 0), 24);
});

test("a small campaign finishes the same day", () => {
  const est = estimateThroughputCompletion(500, 12, 20, 9, new Date("2026-09-17T12:00:00Z"));
  // 12 a minute over 11 sendable hours is 7,920 a day.
  assert.equal(est.perDay, 7920);
  assert.equal(est.estimatedDays, 1);
  assert.equal(est.limitedBy, "throughput");
});

test("a large list spills into following days", () => {
  const est = estimateThroughputCompletion(20000, 12, 20, 9, new Date("2026-09-17T12:00:00Z"));
  assert.equal(est.estimatedDays, 3);
});

test("the cold legacy list is no longer a multi-week drip", () => {
  // The whole reason for leaving the old provider: 2,000 cold contacts took 40
  // days at 50 new contacts a day. On a 10DLC long code it is one day.
  const est = estimateThroughputCompletion(2000, 12, 20, 9);
  assert.equal(est.estimatedDays, 1);
});

test("an empty queue estimates nothing rather than a date", () => {
  const est = estimateThroughputCompletion(0, 12, 20, 9);
  assert.equal(est.pending, 0);
  assert.equal(est.estimatedCompletion, null);
  assert.equal(est.limitedBy, "none");
});

test("a zero rate reports never, not instantly", () => {
  // -1 rather than Infinity: JSON.stringify turns Infinity into null, which
  // the admin UI would render as "0 days" and read as "already finished".
  const est = estimateThroughputCompletion(100, 0, 20, 9);
  assert.equal(est.estimatedDays, -1);
  assert.equal(est.perDay, 0);
  assert.equal(est.estimatedCompletion, null);
});

test("a quiet window covering the whole day also reports never", () => {
  const est = estimateThroughputCompletion(100, 12, 0, 24);
  assert.equal(est.estimatedDays, -1);
});
