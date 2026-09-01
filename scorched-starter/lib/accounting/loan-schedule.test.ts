import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAmortizationSchedule, findNearestUnpaidRow } from "./loan-schedule.ts";

test("LiftFund schedule amortizes to zero using the lender's actual payment", () => {
  const rows = generateAmortizationSchedule({
    principal: 21000,
    annualRate: 0.18,
    termMonths: 54,
    monthlyPayment: 574.66,
    firstDueDate: "2026-05-15",
  });

  assert.equal(rows[0].dueDate, "2026-05-15");
  assert.equal(rows[0].interest, 315); // 21000 * 0.015
  assert.equal(rows[0].principal, 259.66);
  assert.equal(rows[0].balanceAfter, 20740.34);

  assert.equal(rows[1].dueDate, "2026-06-15");
  assert.equal(rows[2].dueDate, "2026-07-15");
  assert.equal(rows[3].dueDate, "2026-08-15");

  const last = rows[rows.length - 1];
  assert.equal(last.balanceAfter, 0);
  assert.ok(rows.length <= 54, "should not exceed the stated term");
  assert.ok(rows.length > 40, "should not pay off implausibly early");

  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  assert.equal(Math.round(totalPrincipal * 100) / 100, 21000);
});

test("findNearestUnpaidRow matches the actual LiftFund payment dates to the right period", () => {
  const rows = generateAmortizationSchedule({
    principal: 21000,
    annualRate: 0.18,
    termMonths: 54,
    monthlyPayment: 574.66,
    firstDueDate: "2026-05-15",
  }).map((r) => ({ ...r, status: "scheduled" as const }));

  const juneMatch = findNearestUnpaidRow(rows, "2026-06-15");
  assert.equal(juneMatch?.period, 2);

  const julyMatch = findNearestUnpaidRow(rows, "2026-07-15");
  assert.equal(julyMatch?.period, 3);

  // Actual bank debit landed on the 17th (15th was a Saturday).
  const augMatch = findNearestUnpaidRow(rows, "2026-08-17");
  assert.equal(augMatch?.period, 4);
});

test("findNearestUnpaidRow does not match a period already marked paid", () => {
  const rows = generateAmortizationSchedule({
    principal: 21000,
    annualRate: 0.18,
    termMonths: 54,
    monthlyPayment: 574.66,
    firstDueDate: "2026-05-15",
  }).map((r) => ({ ...r, status: "scheduled" as string }));

  rows[1].status = "paid"; // period 2 already paid
  const match = findNearestUnpaidRow(rows, "2026-06-15");
  assert.notEqual(match?.period, 2);
});
