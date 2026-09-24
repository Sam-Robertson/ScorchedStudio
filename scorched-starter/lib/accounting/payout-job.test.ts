import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutSourceId, summarizeWithholding } from "./payouts.ts";

test("summarizeWithholding separates capital repayments and payout fees from sales entries", () => {
  const w = summarizeWithholding({
    id: "po_1",
    created_at: "2026-09-01T00:00:00Z",
    entries: [
      { type: "CHARGE", gross_amount_money: { amount: 10000 }, fee_amount_money: { amount: -290 } },
      { type: "REFUND", gross_amount_money: { amount: -1500 } },
      { type: "SQUARE_CAPITAL_PAYMENT", gross_amount_money: { amount: -1200 } },
      { type: "SQUARE_CAPITAL_REVERSED_PAYMENT", gross_amount_money: { amount: 200 } },
      { type: "GIFT_CARD_LOAD_FEE", gross_amount_money: { amount: -125 } },
      { type: "DEPOSIT_FEE", gross_amount_money: { amount: -125 } },
      { type: "SOMETHING_NEW", gross_amount_money: { amount: -1 } },
    ],
  });
  assert.equal(w.capitalRepaymentCents, 1000);
  assert.equal(w.payoutFeeCents, 250);
  assert.deepEqual(w.unhandledTypes, ["SOMETHING_NEW"]);
});

test("payoutSourceId extracts the uuid Square embeds in a payout id", () => {
  assert.equal(payoutSourceId({ id: "po_C324DAE3-bfc3-457a-a461-86a5ff7ca168" }), "c324dae3-bfc3-457a-a461-86a5ff7ca168");
  assert.equal(payoutSourceId({ id: "po_notauuid" }), null);
});
