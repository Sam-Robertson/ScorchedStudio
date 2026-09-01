// lib/accounting/templates.test.ts
// Run with: node --test lib/accounting/templates.test.ts
// (Node's built-in test runner + native TS type stripping — no framework
// installed in this repo yet; see package.json's "test" script.)

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJournalLines,
  expense,
  cogs,
  capex,
  securityDeposit,
  cardPayoff,
  transfer,
  loanProceeds,
  loanPayment,
  cardInterest,
  ownerContribution,
  ownerDraw,
  salesTaxRemit,
  payrollClearing,
  payrollRun,
  depreciation,
  revenueSettlement,
  ignore,
  type JournalLineInput,
} from "./templates.ts";

function sumCents(lines: JournalLineInput[]): number {
  return lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
}

function assertBalances(lines: JournalLineInput[]) {
  assert.equal(sumCents(lines), 0, `lines should sum to zero: ${JSON.stringify(lines)}`);
}

test("expense balances and hits target + src", () => {
  const lines = expense({ amount: 42.17, srcAccountCode: "1000", expenseAccountCode: "6100" });
  assertBalances(lines);
  assert.deepEqual(lines.map((l) => l.accountCode).sort(), ["1000", "6100"]);
});

test("cogs balances", () => assertBalances(cogs({ amount: 133.5, srcAccountCode: "2010" })));

test("capex balances (fixed_assets row creation is the caller's job)", () =>
  assertBalances(capex({ amount: 4500, srcAccountCode: "1000" })));

test("security_deposit balances", () =>
  assertBalances(securityDeposit({ amount: 2000, srcAccountCode: "1000" })));

test("card_payoff balances", () =>
  assertBalances(cardPayoff({ amount: 1200.33, checkingAccountCode: "1000", cardAccountCode: "2000" })));

test("transfer balances", () =>
  assertBalances(transfer({ amount: 500, srcAccountCode: "1100", destAccountCode: "1000" })));

test("loan_proceeds balances", () =>
  assertBalances(loanProceeds({ amount: 21000, srcAccountCode: "1000", loanAccountCode: "2500" })));

test("loan_payment splits principal/interest and balances", () => {
  const lines = loanPayment({ srcAccountCode: "1000", loanAccountCode: "2500", principal: 260.5, interest: 314.16 });
  assertBalances(lines);
  const src = lines.find((l) => l.accountCode === "1000")!;
  assert.equal(src.amount, -574.66);
});

test("card_interest balances", () =>
  assertBalances(cardInterest({ amount: 12.44, cardAccountCode: "2010" })));

test("owner_contribution balances", () =>
  assertBalances(ownerContribution({ amount: 5000, srcAccountCode: "1000" })));

test("owner_draw balances", () =>
  assertBalances(ownerDraw({ amount: 1000, srcAccountCode: "1000" })));

test("sales_tax_remit balances", () =>
  assertBalances(salesTaxRemit({ amount: 812.33, srcAccountCode: "1000" })));

test("payroll_clearing balances", () =>
  assertBalances(payrollClearing({ amount: 3200, srcAccountCode: "1000" })));

test("payroll_run splits wages/employer taxes and balances", () => {
  const lines = payrollRun({ grossWages: 8000, employerTaxes: 640 });
  assertBalances(lines);
  const clearing = lines.find((l) => l.accountCode === "2300")!;
  assert.equal(clearing.amount, -8640);
});

test("depreciation balances", () => assertBalances(depreciation({ amount: 150 })));

test("ignore produces no lines (and trivially balances)", () => assert.deepEqual(ignore(), []));

test("revenue_settlement balances with tax and processing fees only", () => {
  const lines = revenueSettlement({
    clearingAccountCode: "1100",
    netSales: 1000,
    taxCollected: 71.5,
    processingFees: 28.4,
  });
  assertBalances(lines);
});

test("revenue_settlement balances with gift card sale + redemption", () => {
  const lines = revenueSettlement({
    clearingAccountCode: "1100",
    netSales: 500,
    taxCollected: 35.63,
    giftCardSales: 100,
    giftCardRedeemed: 60,
    processingFees: 15.2,
  });
  assertBalances(lines);
});

test("revenue_settlement: floating point amounts still balance exactly", () => {
  const lines = revenueSettlement({
    clearingAccountCode: "1110",
    netSales: 0.1 + 0.2, // classic float trap
    taxCollected: 0.03,
    processingFees: 0.01,
  });
  assertBalances(lines);
});

test("every template in the dispatcher balances", () => {
  const cases: Parameters<typeof buildJournalLines>[0][] = [
    { template: "expense", input: { amount: 10, srcAccountCode: "1000", expenseAccountCode: "6500" } },
    { template: "cogs", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "capex", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "security_deposit", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "card_payoff", input: { amount: 10, checkingAccountCode: "1000", cardAccountCode: "2000" } },
    { template: "transfer", input: { amount: 10, srcAccountCode: "1000", destAccountCode: "1010" } },
    { template: "loan_proceeds", input: { amount: 10, srcAccountCode: "1000", loanAccountCode: "2500" } },
    { template: "loan_payment", input: { srcAccountCode: "1000", loanAccountCode: "2500", principal: 6, interest: 4 } },
    { template: "card_interest", input: { amount: 10, cardAccountCode: "2000" } },
    { template: "owner_contribution", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "owner_draw", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "sales_tax_remit", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "payroll_clearing", input: { amount: 10, srcAccountCode: "1000" } },
    { template: "payroll_run", input: { grossWages: 8, employerTaxes: 2 } },
    { template: "depreciation", input: { amount: 10 } },
    { template: "revenue_settlement", input: { clearingAccountCode: "1100", netSales: 10, taxCollected: 1, processingFees: 1 } },
    { template: "ignore", input: {} },
  ];
  for (const c of cases) {
    assertBalances(buildJournalLines(c));
  }
});
