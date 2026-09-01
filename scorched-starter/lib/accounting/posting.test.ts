// lib/accounting/posting.test.ts
// Run with: node --test lib/accounting/posting.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { buildLinesForBankRule } from "./posting.ts";
import type { CategorizationRule, MatchableTransaction } from "./rules.ts";
import type { JournalLineInput } from "./templates.ts";

function rule(overrides: Partial<CategorizationRule>): CategorizationRule {
  return {
    id: "rule-1", priority: 100, matchField: "name", matchRegex: ".*",
    bankAccountId: null, amountMin: null, amountMax: null, direction: null,
    template: "expense", targetAccountId: null, loanId: null, locationId: null,
    active: true, ...overrides,
  };
}

function txn(overrides: Partial<MatchableTransaction>): MatchableTransaction {
  return { bankAccountId: "acct-1", name: "UPPARKWAY", merchantName: null, amount: 3200, ...overrides };
}

function sumCents(lines: { amount: number }[]) {
  return lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
}

test("expense: needs a target account, otherwise unsupported", () => {
  const noTarget = buildLinesForBankRule(rule({ template: "expense" }), txn({}), { srcAccountCode: "1000", targetAccountCode: null });
  assert.equal(noTarget.ok, false);

  const withTarget = buildLinesForBankRule(rule({ template: "expense" }), txn({}), { srcAccountCode: "1000", targetAccountCode: "6100" });
  assert.equal(withTarget.ok, true);
  if (withTarget.ok) {
    assert.equal(sumCents(withTarget.lines), 0);
    assert.deepEqual(withTarget.lines.map((l) => l.accountCode).sort(), ["1000", "6100"]);
  }
});

test("card_interest uses the src account as the card account (no target needed)", () => {
  const result = buildLinesForBankRule(rule({ template: "card_interest" }), txn({ amount: 12.5 }), {
    srcAccountCode: "2010", targetAccountCode: null,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(sumCents(result.lines), 0);
});

test("uses the absolute value of the transaction amount for the magnitude", () => {
  const debit = buildLinesForBankRule(rule({ template: "cogs" }), txn({ amount: 133.5 }), { srcAccountCode: "1000", targetAccountCode: null });
  assert.equal(debit.ok, true);
  if (debit.ok) assert.equal(Math.abs(debit.lines[0].amount), 133.5);
});

test("a credit against a normally-debit template flips debit/credit rather than reapplying the same posting", () => {
  // e.g. a card issuer's "Cash Rebate Statement Credit Fulfillment" — a
  // real credit against what's normally an expense-posting descriptor.
  // Blindly using the debit-direction posting would DEBIT (increase) the
  // expense; it should reduce it instead, which is a Dr/Cr swap between
  // the same two accounts, not a different amount.
  const debit = buildLinesForBankRule(rule({ template: "expense" }), txn({ amount: 100 }), { srcAccountCode: "2010", targetAccountCode: "6900" });
  const credit = buildLinesForBankRule(rule({ template: "expense" }), txn({ amount: -100 }), { srcAccountCode: "2010", targetAccountCode: "6900" });
  assert.equal(debit.ok, true);
  assert.equal(credit.ok, true);
  if (debit.ok && credit.ok) {
    const debitLines: JournalLineInput[] = debit.lines;
    const creditLines: JournalLineInput[] = credit.lines;
    assert.equal(sumCents(creditLines), 0);
    for (const l of creditLines) {
      const opposite: JournalLineInput = debitLines.find((d) => d.accountCode === l.accountCode)!;
      assert.equal(l.amount, -opposite.amount);
    }
  }
});

test("owner_contribution (naturally a credit) flips correctly for an unexpected debit", () => {
  const normal = buildLinesForBankRule(rule({ template: "owner_contribution" }), txn({ amount: -5000 }), { srcAccountCode: "1000", targetAccountCode: null });
  const flipped = buildLinesForBankRule(rule({ template: "owner_contribution" }), txn({ amount: 5000 }), { srcAccountCode: "1000", targetAccountCode: null });
  assert.equal(normal.ok, true);
  assert.equal(flipped.ok, true);
  if (normal.ok && flipped.ok) {
    const normalLines: JournalLineInput[] = normal.lines;
    const flippedLines: JournalLineInput[] = flipped.lines;
    assert.equal(sumCents(flippedLines), 0);
    for (const l of flippedLines) {
      const opposite: JournalLineInput = normalLines.find((d) => d.accountCode === l.accountCode)!;
      assert.equal(l.amount, -opposite.amount);
    }
  }
});

test("loan_payment is explicitly unsupported until Phase 4", () => {
  const result = buildLinesForBankRule(rule({ template: "loan_payment" }), txn({}), { srcAccountCode: "1000", targetAccountCode: "2500" });
  assert.equal(result.ok, false);
});

test("revenue_settlement is not postable from a bank rule", () => {
  const result = buildLinesForBankRule(rule({ template: "revenue_settlement" }), txn({}), { srcAccountCode: "1100", targetAccountCode: null });
  assert.equal(result.ok, false);
});

test("transfer requires a target account", () => {
  const result = buildLinesForBankRule(rule({ template: "transfer" }), txn({}), { srcAccountCode: "1100", targetAccountCode: null });
  assert.equal(result.ok, false);
});

test("transfer: outflow (debit) keeps the feed account as source", () => {
  // e.g. moving money from Chase checking (the feed) to UCCU checking (the target)
  const result = buildLinesForBankRule(rule({ template: "transfer" }), txn({ amount: 500 }), {
    srcAccountCode: "1000", targetAccountCode: "1010",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(sumCents(result.lines), 0);
    const dest = result.lines.find((l) => l.accountCode === "1010")!;
    const src = result.lines.find((l) => l.accountCode === "1000")!;
    assert.equal(dest.amount, 500); // Dr — destination receives
    assert.equal(src.amount, -500); // Cr — feed account pays out
  }
});

test("transfer: inflow (credit) makes the feed account the destination, not the source", () => {
  // e.g. a Square payout landing in Chase checking (the feed): checking
  // should be debited and Square Clearing (the rule's target) credited —
  // the reverse of the outflow case, even though it's the same template.
  const result = buildLinesForBankRule(rule({ template: "transfer" }), txn({ amount: -500 }), {
    srcAccountCode: "1000", targetAccountCode: "1100",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(sumCents(result.lines), 0);
    const checking = result.lines.find((l) => l.accountCode === "1000")!;
    const clearing = result.lines.find((l) => l.accountCode === "1100")!;
    assert.equal(checking.amount, 500);  // Dr 1000 — checking receives the payout
    assert.equal(clearing.amount, -500); // Cr 1100 — clearing account drains
  }
});
