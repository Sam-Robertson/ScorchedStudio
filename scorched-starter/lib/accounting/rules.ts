// lib/accounting/rules.ts
//
// Categorization rules engine (build spec §6). Pure matching — no DB calls —
// so it's unit-testable with synthetic transactions, same shape as
// templates.ts. Rules evaluate in priority order (lowest first); first
// match wins.
//
// Two rule outcomes beyond "post a template" show up in the spec's seed
// table (§6): a target of "inbox" (e.g. "Online Transfer To Main" — could be
// an owner draw or a transfer, a human must decide) and the plain "ignore"
// template (duplicates/reversals). Both are represented as a normal
// categorization_rules row with template = 'inbox' or 'ignore' — 'inbox'
// still records which rule matched (so the review UI can show a suggestion)
// but leaves the transaction unreviewed instead of posting.

export type Direction = "debit" | "credit";

export type MatchableTransaction = {
  bankAccountId: string;
  name: string | null;
  merchantName: string | null;
  amount: number; // Plaid sign convention: positive = money leaving the account
};

export type CategorizationRule = {
  id: string;
  priority: number;
  matchField: "name" | "merchant_name";
  matchRegex: string;
  bankAccountId: string | null; // null = any
  amountMin: number | null;
  amountMax: number | null;
  direction: Direction | null;
  template: string; // one of the templates.ts template names, or 'inbox'
  targetAccountId: string | null;
  loanId: string | null;
  locationId: string | null;
  active: boolean;
};

export function directionOf(amount: number): Direction {
  return amount > 0 ? "debit" : "credit";
}

export function ruleMatchesTransaction(rule: CategorizationRule, txn: MatchableTransaction): boolean {
  if (!rule.active) return false;
  if (rule.bankAccountId && rule.bankAccountId !== txn.bankAccountId) return false;

  const absAmount = Math.abs(txn.amount);
  if (rule.amountMin != null && absAmount < rule.amountMin) return false;
  if (rule.amountMax != null && absAmount > rule.amountMax) return false;
  if (rule.direction && rule.direction !== directionOf(txn.amount)) return false;

  const field = rule.matchField === "merchant_name" ? txn.merchantName : txn.name;
  if (!field) return false;

  let regex: RegExp;
  try {
    regex = new RegExp(rule.matchRegex, "i");
  } catch {
    return false; // a malformed regex should never crash the sync job
  }
  return regex.test(field);
}

// First match wins, evaluated in ascending priority order.
export function matchRule(txn: MatchableTransaction, rules: CategorizationRule[]): CategorizationRule | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (ruleMatchesTransaction(rule, txn)) return rule;
  }
  return null;
}

export type RuleOutcome =
  | { action: "post"; rule: CategorizationRule }
  | { action: "ignore"; rule: CategorizationRule }
  | { action: "flag"; rule: CategorizationRule } // matched 'inbox' — leave unreviewed with a suggestion
  | { action: "review"; rule: null }; // no rule matched at all

export function classify(txn: MatchableTransaction, rules: CategorizationRule[]): RuleOutcome {
  const rule = matchRule(txn, rules);
  if (!rule) return { action: "review", rule: null };
  if (rule.template === "ignore") return { action: "ignore", rule };
  if (rule.template === "inbox") return { action: "flag", rule };
  return { action: "post", rule };
}
