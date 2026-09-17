import test from "node:test";
import assert from "node:assert/strict";
import { computeBudget, estimateCompletion, type BudgetInputs } from "./sms-budget.ts";

function inputs(over: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    newContactsPerHour: 15,
    newContactsPerDay: 50,
    burstPerSecond: 10,
    newContactsSentLastHour: 0,
    newContactsSentLastDay: 0,
    runSeconds: 60,
    maxConsecutiveNoReply: 150,
    consecutiveNoReply: 0,
    ...over,
  };
}

test("a fresh run gets the full hourly allowance", () => {
  assert.equal(computeBudget(inputs()).newContacts, 15);
});

test("sends already made this hour come off the allowance", () => {
  assert.equal(computeBudget(inputs({ newContactsSentLastHour: 10 })).newContacts, 5);
  assert.equal(computeBudget(inputs({ newContactsSentLastHour: 15 })).newContacts, 0);
});

test("the daily cap governs once it is tighter than the hourly one", () => {
  // 48 of today's 50 already gone: the hourly pool says 15, but only 2 remain.
  const budget = computeBudget(inputs({ newContactsSentLastDay: 48 }));
  assert.equal(budget.newContacts, 2);
});

test("an exhausted daily cap yields nothing even with a fresh hour", () => {
  assert.equal(computeBudget(inputs({ newContactsSentLastDay: 50 })).newContacts, 0);
});

test("overshooting a cap never produces a negative allowance", () => {
  // A limit lowered mid-day could leave the trailing count above the new cap.
  const budget = computeBudget(inputs({ newContactsSentLastDay: 80, newContactsSentLastHour: 40 }));
  assert.equal(budget.newContacts, 0);
});

test("the caps are read from config, not hardcoded", () => {
  // The whole point: Sam may negotiate different numbers.
  const budget = computeBudget(inputs({ newContactsPerHour: 200, newContactsPerDay: 1000 }));
  assert.equal(budget.newContacts, 200);
});

test("total throughput comes from the burst limit and the run length", () => {
  assert.equal(computeBudget(inputs({ burstPerSecond: 10, runSeconds: 60 })).total, 600);
  assert.equal(computeBudget(inputs({ burstPerSecond: 1, runSeconds: 30 })).total, 30);
});

test("the consecutive-no-reply ceiling stops the run outright", () => {
  // Sendblue enforces this itself and says it cannot be disabled, so sending
  // into it means messages are silently dropped.
  const budget = computeBudget(inputs({ consecutiveNoReply: 150 }));
  assert.equal(budget.newContacts, 0);
  assert.equal(budget.total, 0);
  assert.match(budget.blockedReason ?? "", /consecutive outbound/);
});

test("staying under the ceiling does not block", () => {
  const budget = computeBudget(inputs({ consecutiveNoReply: 149 }));
  assert.equal(budget.blockedReason, null);
  assert.ok(budget.total > 0);
});

test("a legacy import of 2000 cold contacts is reported as a multi-day drip", () => {
  // The honest answer for the re-intro campaign, and the reason the admin UI
  // shows an estimate before anyone presses send.
  const est = estimateCompletion(2000, 0, 50, new Date("2026-09-17T12:00:00Z"));
  assert.equal(est.estimatedDays, 40);
  assert.equal(est.limitedBy, "new-contact-cap");
  assert.equal(est.pending, 2000);
});

test("a campaign to established contacts only finishes inside a run", () => {
  const est = estimateCompletion(0, 300, 50, new Date("2026-09-17T12:00:00Z"));
  assert.equal(est.estimatedDays, 0);
  assert.equal(est.limitedBy, "burst");
});

test("an empty queue estimates nothing rather than a date", () => {
  const est = estimateCompletion(0, 0, 50);
  assert.equal(est.pending, 0);
  assert.equal(est.estimatedCompletion, null);
});

test("a partial day rounds up, since a remainder still needs its own day", () => {
  assert.equal(estimateCompletion(51, 0, 50).estimatedDays, 2);
  assert.equal(estimateCompletion(50, 0, 50).estimatedDays, 1);
});
