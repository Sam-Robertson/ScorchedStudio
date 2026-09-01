// lib/accounting/templates.ts
//
// Posting templates: the single place accounting treatment lives (build
// spec §3). Each template is a pure function: (input) -> balanced journal
// lines, keyed by account CODE (not id — the caller/DB layer resolves codes
// to account ids, see post_journal_entry() in supabase-accounting-setup.sql).
// Pure and DB-free so they're unit-testable without a database.
//
// Sign convention: amount is signed — debit positive, credit negative.
// Every line's amount is in dollars (numeric(12,2) in the DB), but internally
// this module works in integer cents so line sums are always exactly zero
// regardless of floating-point input.

export type JournalLineInput = {
  accountCode: string;
  amount: number; // dollars, signed: debit positive, credit negative
  memo?: string;
};

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function line(accountCode: string, cents: number, memo?: string): JournalLineInput {
  return { accountCode, amount: cents / 100, memo };
}

function assertBalanced(lines: JournalLineInput[]): JournalLineInput[] {
  const sumCents = lines.reduce((s, l) => s + toCents(l.amount), 0);
  if (sumCents !== 0) {
    throw new Error(`Template produced unbalanced lines (sum=${sumCents / 100}): ${JSON.stringify(lines)}`);
  }
  return lines;
}

// ── Per-template inputs ─────────────────────────────────────────────────────

export type ExpenseInput = { amount: number; srcAccountCode: string; expenseAccountCode: string; memo?: string };
export type CogsInput = { amount: number; srcAccountCode: string; memo?: string };
// capex also requires the caller to insert a fixed_assets row — this
// function only returns the two journal lines.
export type CapexInput = { amount: number; srcAccountCode: string; memo?: string };
export type SecurityDepositInput = { amount: number; srcAccountCode: string; memo?: string };
export type CardPayoffInput = { amount: number; checkingAccountCode: string; cardAccountCode: string; memo?: string };
export type TransferInput = { amount: number; srcAccountCode: string; destAccountCode: string; memo?: string };
export type LoanProceedsInput = { amount: number; srcAccountCode: string; loanAccountCode: string; memo?: string };
// principal/interest come from the loan's next unpaid amortization row (§5.5) — the
// template just splits the bank debit per whatever the caller looked up.
export type LoanPaymentInput = { srcAccountCode: string; loanAccountCode: string; principal: number; interest: number; memo?: string };
export type CardInterestInput = { amount: number; cardAccountCode: string; memo?: string };
export type OwnerContributionInput = { amount: number; srcAccountCode: string; memo?: string };
export type OwnerDrawInput = { amount: number; srcAccountCode: string; memo?: string };
export type SalesTaxRemitInput = { amount: number; srcAccountCode: string; memo?: string };
export type PayrollClearingInput = { amount: number; srcAccountCode: string; memo?: string };
export type CardInterestChargeInput = CardInterestInput;

export type PayrollRunInput = {
  grossWages: number;
  employerTaxes: number;
  memo?: string;
};

// Revenue settlement (§5.2). No `tips` field: Scorched Studio doesn't
// collect tips (confirmed with the user), and the spec's worked formula
// can't balance a nonzero tips figure as written anyway (verified: the
// spec's seven lines net out to `tips - gift_card_sales`, not zero — tips
// is credited nowhere). If that ever changes, tips will need a liability
// leg of their own (e.g. a dedicated Tips Payable account) rather than
// being folded into an existing clearing account.
export type RevenueSettlementInput = {
  clearingAccountCode: string; // 1100 Square Clearing or 1110 Stripe Clearing
  revenueAccountCode?: string; // defaults to 4000 Session Revenue
  netSales: number;
  taxCollected: number;
  giftCardSales?: number;
  giftCardRedeemed?: number;
  processingFees: number;
  memo?: string;
};

export type DepreciationInput = { amount: number; memo?: string };

export type TemplateInput =
  | { template: "expense"; input: ExpenseInput }
  | { template: "cogs"; input: CogsInput }
  | { template: "capex"; input: CapexInput }
  | { template: "security_deposit"; input: SecurityDepositInput }
  | { template: "card_payoff"; input: CardPayoffInput }
  | { template: "transfer"; input: TransferInput }
  | { template: "loan_proceeds"; input: LoanProceedsInput }
  | { template: "loan_payment"; input: LoanPaymentInput }
  | { template: "card_interest"; input: CardInterestInput }
  | { template: "owner_contribution"; input: OwnerContributionInput }
  | { template: "owner_draw"; input: OwnerDrawInput }
  | { template: "sales_tax_remit"; input: SalesTaxRemitInput }
  | { template: "payroll_clearing"; input: PayrollClearingInput }
  | { template: "revenue_settlement"; input: RevenueSettlementInput }
  | { template: "payroll_run"; input: PayrollRunInput }
  | { template: "depreciation"; input: DepreciationInput }
  | { template: "ignore"; input: Record<string, never> };

export const ACCOUNTS = {
  fixedAssets: "1500",
  securityDeposits: "1200",
  salesTaxPayable: "2100",
  deferredRevenue: "2200",
  payrollClearing: "2300",
  ownerContributions: "3000",
  ownerDraws: "3010",
  sessionRevenue: "4000",
  cogs: "5000",
  wages: "6000",
  employerTaxes: "6010",
  processingFees: "6300",
  depreciation: "7000",
  interestExpense: "8000",
} as const;

// ── Templates ────────────────────────────────────────────────────────────────

export function expense(i: ExpenseInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(i.expenseAccountCode, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function cogs(i: CogsInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.cogs, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function capex(i: CapexInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.fixedAssets, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function securityDeposit(i: SecurityDepositInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.securityDeposits, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function cardPayoff(i: CardPayoffInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(i.cardAccountCode, c, i.memo),
    line(i.checkingAccountCode, -c, i.memo),
  ]);
}

export function transfer(i: TransferInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(i.destAccountCode, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function loanProceeds(i: LoanProceedsInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(i.srcAccountCode, c, i.memo),
    line(i.loanAccountCode, -c, i.memo),
  ]);
}

export function loanPayment(i: LoanPaymentInput): JournalLineInput[] {
  const principalCents = toCents(i.principal);
  const interestCents = toCents(i.interest);
  return assertBalanced([
    line(i.loanAccountCode, principalCents, i.memo),
    line(ACCOUNTS.interestExpense, interestCents, i.memo),
    line(i.srcAccountCode, -(principalCents + interestCents), i.memo),
  ]);
}

export function cardInterest(i: CardInterestInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.interestExpense, c, i.memo),
    line(i.cardAccountCode, -c, i.memo),
  ]);
}

export function ownerContribution(i: OwnerContributionInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(i.srcAccountCode, c, i.memo),
    line(ACCOUNTS.ownerContributions, -c, i.memo),
  ]);
}

export function ownerDraw(i: OwnerDrawInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.ownerDraws, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function salesTaxRemit(i: SalesTaxRemitInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.salesTaxPayable, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function payrollClearing(i: PayrollClearingInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.payrollClearing, c, i.memo),
    line(i.srcAccountCode, -c, i.memo),
  ]);
}

export function payrollRun(i: PayrollRunInput): JournalLineInput[] {
  const wagesCents = toCents(i.grossWages);
  const taxesCents = toCents(i.employerTaxes);
  return assertBalanced([
    line(ACCOUNTS.wages, wagesCents, i.memo),
    line(ACCOUNTS.employerTaxes, taxesCents, i.memo),
    line(ACCOUNTS.payrollClearing, -(wagesCents + taxesCents), i.memo),
  ]);
}

export function depreciation(i: DepreciationInput): JournalLineInput[] {
  const c = toCents(i.amount);
  return assertBalanced([
    line(ACCOUNTS.depreciation, c, i.memo),
    line("1510", -c, i.memo), // Accumulated Depreciation
  ]);
}

export function revenueSettlement(i: RevenueSettlementInput): JournalLineInput[] {
  const revenueAccount = i.revenueAccountCode ?? ACCOUNTS.sessionRevenue;
  const giftCardSales = i.giftCardSales ?? 0;
  const giftCardRedeemed = i.giftCardRedeemed ?? 0;

  const netSalesCents = toCents(i.netSales);
  const taxCents = toCents(i.taxCollected);
  const feesCents = toCents(i.processingFees);
  const giftSalesCents = toCents(giftCardSales);
  const giftRedeemedCents = toCents(giftCardRedeemed);

  // Cash actually landing in the clearing account: net sales (minus the
  // portion settled via gift card, which isn't new cash) + tax
  // + new gift card sales (which ARE new cash) - processing fees.
  const clearingCents =
    netSalesCents + taxCents + giftSalesCents - giftRedeemedCents - feesCents;

  const lines: JournalLineInput[] = [
    line(i.clearingAccountCode, clearingCents, i.memo),
    line(ACCOUNTS.processingFees, feesCents, i.memo),
  ];
  if (giftRedeemedCents !== 0) lines.push(line(ACCOUNTS.deferredRevenue, giftRedeemedCents, i.memo));
  lines.push(line(revenueAccount, -netSalesCents, i.memo));
  if (taxCents !== 0) lines.push(line(ACCOUNTS.salesTaxPayable, -taxCents, i.memo));
  if (giftSalesCents !== 0) lines.push(line(ACCOUNTS.deferredRevenue, -giftSalesCents, i.memo));

  return assertBalanced(lines);
}

export function ignore(): JournalLineInput[] {
  return [];
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function buildJournalLines(t: TemplateInput): JournalLineInput[] {
  switch (t.template) {
    case "expense": return expense(t.input);
    case "cogs": return cogs(t.input);
    case "capex": return capex(t.input);
    case "security_deposit": return securityDeposit(t.input);
    case "card_payoff": return cardPayoff(t.input);
    case "transfer": return transfer(t.input);
    case "loan_proceeds": return loanProceeds(t.input);
    case "loan_payment": return loanPayment(t.input);
    case "card_interest": return cardInterest(t.input);
    case "owner_contribution": return ownerContribution(t.input);
    case "owner_draw": return ownerDraw(t.input);
    case "sales_tax_remit": return salesTaxRemit(t.input);
    case "payroll_clearing": return payrollClearing(t.input);
    case "revenue_settlement": return revenueSettlement(t.input);
    case "payroll_run": return payrollRun(t.input);
    case "depreciation": return depreciation(t.input);
    case "ignore": return ignore();
  }
}
