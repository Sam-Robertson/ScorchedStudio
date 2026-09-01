// lib/accounting/posting.ts
//
// Turns a matched categorization rule + a bank transaction into journal
// lines, via templates.ts. Pure (no DB) — the caller resolves account codes
// (bank_accounts.ledger_account_id -> accounts.code, rule.target_account_id
// -> accounts.code) before calling this.
//
// Only templates that make sense fired directly off a single bank
// transaction are handled here. revenue_settlement, payroll_run, and
// depreciation are posted by their own jobs (Phase 3/4), never by the bank
// rules engine. loan_payment needs an amortization schedule split
// (principal vs. interest) that doesn't exist until Phase 4's loans
// register, so it's explicitly unsupported here for now — those bank rows
// stay in the inbox until then.
import { buildJournalLines, type JournalLineInput, type TemplateInput } from "./templates.ts";
import { directionOf, type MatchableTransaction, type CategorizationRule } from "./rules.ts";

export type ResolvedCodes = {
  srcAccountCode: string;
  targetAccountCode: string | null;
};

export type PostingResult =
  | { ok: true; lines: JournalLineInput[] }
  | { ok: false; reason: string };

// The direction each template normally fires on. A real Amex "ACH Pmt"
// autopay is always a debit on checking, but the same descriptor pattern
// can also show up as a credit — a reversed payroll debit, a card issuer's
// statement-credit rebate, a refunded purchase at an otherwise-expense
// merchant. Confirmed against real synced data (a "Cash Rebate Statement
// Credit Fulfillment" credit would otherwise have been debited to an
// expense account, increasing it, when it should reduce it). When a
// transaction's actual direction doesn't match the template's natural one,
// every line's sign is flipped — same two accounts, debit and credit swap
// sides — rather than blindly applying the natural-direction posting.
const NATURAL_DIRECTION: Partial<Record<string, "debit" | "credit">> = {
  expense: "debit",
  cogs: "debit",
  capex: "debit",
  security_deposit: "debit",
  card_payoff: "debit",
  card_interest: "debit",
  sales_tax_remit: "debit",
  payroll_clearing: "debit",
  owner_draw: "debit",
  owner_contribution: "credit",
  loan_proceeds: "credit",
};

export function buildLinesForBankRule(
  rule: CategorizationRule,
  txn: MatchableTransaction,
  resolved: ResolvedCodes,
  memo?: string
): PostingResult {
  const amount = Math.abs(txn.amount);
  const { srcAccountCode, targetAccountCode } = resolved;

  let input: TemplateInput;
  switch (rule.template) {
    case "expense": {
      if (!targetAccountCode) return { ok: false, reason: "rule needs a target expense account" };
      input = { template: "expense", input: { amount, srcAccountCode, expenseAccountCode: targetAccountCode, memo } };
      break;
    }
    case "cogs":
      input = { template: "cogs", input: { amount, srcAccountCode, memo } };
      break;
    case "capex":
      input = { template: "capex", input: { amount, srcAccountCode, memo } };
      break;
    case "security_deposit":
      input = { template: "security_deposit", input: { amount, srcAccountCode, memo } };
      break;
    case "card_payoff": {
      if (!targetAccountCode) return { ok: false, reason: "rule needs a target card account" };
      input = { template: "card_payoff", input: { amount, checkingAccountCode: srcAccountCode, cardAccountCode: targetAccountCode, memo } };
      break;
    }
    case "transfer": {
      // Unlike every other case, the feed account isn't always the source:
      // a credit (inflow) means money is arriving FROM the rule's target
      // into this feed account, e.g. a Square/Stripe payout landing in
      // checking (§5.2 — "Dr 1000, Cr 1100") is a *credit* on the checking
      // feed, so checking is the destination and Square Clearing (the
      // rule's target) is the source. A debit (outflow), e.g. moving money
      // to another of our own accounts, keeps the feed account as source.
      if (!targetAccountCode) return { ok: false, reason: "rule needs a target (the other side of the transfer)" };
      input = txn.amount > 0
        ? { template: "transfer", input: { amount, srcAccountCode, destAccountCode: targetAccountCode, memo } }
        : { template: "transfer", input: { amount, srcAccountCode: targetAccountCode, destAccountCode: srcAccountCode, memo } };
      break;
    }
    case "loan_proceeds": {
      if (!targetAccountCode) return { ok: false, reason: "rule needs a target loan liability account" };
      input = { template: "loan_proceeds", input: { amount, srcAccountCode, loanAccountCode: targetAccountCode, memo } };
      break;
    }
    case "card_interest":
      input = { template: "card_interest", input: { amount, cardAccountCode: srcAccountCode, memo } };
      break;
    case "owner_contribution":
      input = { template: "owner_contribution", input: { amount, srcAccountCode, memo } };
      break;
    case "owner_draw":
      input = { template: "owner_draw", input: { amount, srcAccountCode, memo } };
      break;
    case "sales_tax_remit":
      input = { template: "sales_tax_remit", input: { amount, srcAccountCode, memo } };
      break;
    case "payroll_clearing":
      input = { template: "payroll_clearing", input: { amount, srcAccountCode, memo } };
      break;
    case "loan_payment":
      return { ok: false, reason: "loan_payment needs an amortization schedule — available starting Phase 4" };
    default:
      return { ok: false, reason: `template '${rule.template}' is not postable from a single bank transaction` };
  }

  const lines = buildJournalLines(input);
  const natural = NATURAL_DIRECTION[rule.template];
  const flip = natural != null && natural !== directionOf(txn.amount);
  return { ok: true, lines: flip ? lines.map((l) => ({ ...l, amount: -l.amount })) : lines };
}
