// lib/accounting/rules.test.ts
// Run with: node --test lib/accounting/rules.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { classify, directionOf, matchRule, ruleMatchesTransaction, type CategorizationRule, type MatchableTransaction } from "./rules.ts";

function rule(overrides: Partial<CategorizationRule>): CategorizationRule {
  return {
    id: overrides.id ?? "rule-1",
    priority: 100,
    matchField: "name",
    matchRegex: ".*",
    bankAccountId: null,
    amountMin: null,
    amountMax: null,
    direction: null,
    template: "expense",
    targetAccountId: null,
    loanId: null,
    locationId: null,
    active: true,
    ...overrides,
  };
}

function txn(overrides: Partial<MatchableTransaction>): MatchableTransaction {
  return {
    bankAccountId: "acct-1",
    name: "AMAZON.COM*1234",
    merchantName: "Amazon",
    amount: 42.5,
    ...overrides,
  };
}

test("directionOf: positive is debit, negative is credit", () => {
  assert.equal(directionOf(10), "debit");
  assert.equal(directionOf(-10), "credit");
});

test("matches on name field by regex", () => {
  const r = rule({ matchRegex: "AMAZON" });
  assert.ok(ruleMatchesTransaction(r, txn({})));
});

test("does not match when regex misses", () => {
  const r = rule({ matchRegex: "COSTCO" });
  assert.ok(!ruleMatchesTransaction(r, txn({})));
});

test("matches on merchant_name field when specified", () => {
  const r = rule({ matchField: "merchant_name", matchRegex: "^Amazon$" });
  assert.ok(ruleMatchesTransaction(r, txn({ merchantName: "Amazon", name: "something else" })));
});

test("inactive rule never matches", () => {
  const r = rule({ matchRegex: "AMAZON", active: false });
  assert.ok(!ruleMatchesTransaction(r, txn({})));
});

test("bankAccountId constraint restricts to that account", () => {
  const r = rule({ matchRegex: "AMAZON", bankAccountId: "acct-2" });
  assert.ok(!ruleMatchesTransaction(r, txn({ bankAccountId: "acct-1" })));
  assert.ok(ruleMatchesTransaction(r, txn({ bankAccountId: "acct-2" })));
});

test("direction constraint checks the sign, not the account kind", () => {
  const debitOnly = rule({ matchRegex: "AMAZON", direction: "debit" });
  assert.ok(ruleMatchesTransaction(debitOnly, txn({ amount: 42.5 })));
  assert.ok(!ruleMatchesTransaction(debitOnly, txn({ amount: -42.5 })));
});

test("amount range constraint uses absolute value", () => {
  const r = rule({ matchRegex: "AMAZON", amountMin: 1000 });
  assert.ok(!ruleMatchesTransaction(r, txn({ amount: -50 })));
  assert.ok(ruleMatchesTransaction(r, txn({ amount: -1500 })));
});

test("a transaction with no name/merchant never matches a name/merchant_name rule", () => {
  const r = rule({ matchRegex: ".*" });
  assert.ok(!ruleMatchesTransaction(r, txn({ name: null })));
});

test("a malformed regex fails closed instead of throwing", () => {
  const r = rule({ matchRegex: "(unterminated" });
  assert.doesNotThrow(() => ruleMatchesTransaction(r, txn({})));
  assert.ok(!ruleMatchesTransaction(r, txn({})));
});

test("matchRule picks the lowest-priority match, ignoring order given", () => {
  const low = rule({ id: "low", priority: 10, matchRegex: "AMAZON" });
  const high = rule({ id: "high", priority: 90, matchRegex: "AMAZON" });
  const matched = matchRule(txn({}), [high, low]);
  assert.equal(matched?.id, "low");
});

test("classify: no match -> review", () => {
  const outcome = classify(txn({ name: "SOMETHING UNRECOGNIZED" }), [rule({ matchRegex: "AMAZON" })]);
  assert.deepEqual(outcome, { action: "review", rule: null });
});

test("classify: template 'ignore' -> ignore", () => {
  const r = rule({ matchRegex: "AMAZON", template: "ignore" });
  const outcome = classify(txn({}), [r]);
  assert.equal(outcome.action, "ignore");
});

test("classify: template 'inbox' -> flag (recorded but left unreviewed)", () => {
  const r = rule({ matchRegex: "Online Transfer To Main", template: "inbox" });
  const outcome = classify(txn({ name: "Online Transfer To Main ###3762" }), [r]);
  assert.equal(outcome.action, "flag");
  assert.equal(outcome.rule?.id, r.id);
});

test("classify: any other template -> post", () => {
  const r = rule({ matchRegex: "AMAZON", template: "expense" });
  const outcome = classify(txn({}), [r]);
  assert.equal(outcome.action, "post");
});
