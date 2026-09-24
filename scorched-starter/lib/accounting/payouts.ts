// lib/accounting/payouts.ts
//
// Pure helpers for Square payouts, kept free of app imports so they can be
// unit-tested the same way templates.ts and posting.ts are. The Square API
// calls live in lib/square-payouts.ts and the posting in payout-job.ts.
//
// Square's daily settlement (lib/square-revenue.ts) covers what was sold.
// What actually lands in the bank is smaller whenever Square keeps part of
// a payout for itself: Square Capital repayments are withheld from every
// payout while an advance is outstanding, and gift card loads carry their
// own fee that never appears on a payment's processing_fee. Neither shows
// up in Orders, Payments, Refunds or Gift Card Activities, so the only
// place to see them is the Payouts API. Found in the September 2026 audit:
// the Square Clearing account had grown by the withheld amounts for four
// months while the Square Capital liability never moved.

export type SquareMoney = { amount?: number; currency?: string } | null | undefined;

export type SquarePayoutEntry = {
  id?: string;
  type?: string; // CHARGE | REFUND | SQUARE_CAPITAL_PAYMENT | SQUARE_CAPITAL_REVERSED_PAYMENT | GIFT_CARD_LOAD_FEE | DEPOSIT_FEE | ...
  effective_at?: string;
  gross_amount_money?: SquareMoney;
  fee_amount_money?: SquareMoney;
  net_amount_money?: SquareMoney;
};

export type SquarePayout = {
  id: string;
  status?: string; // SENT | FAILED | PAID
  location_id?: string;
  created_at: string;
  amount_money?: SquareMoney;
  type?: string;
  entries?: SquarePayoutEntry[];
};

export type PayoutWithholding = {
  capitalRepaymentCents: number; // positive = principal repaid to Square Capital
  payoutFeeCents: number; // positive = fees Square kept (gift card load, instant deposit)
  unhandledTypes: string[];
};

function cents(m: SquareMoney): number {
  return m?.amount ?? 0;
}

// What Square kept out of one payout, beyond the per-payment processing
// fees the daily settlement already expensed. CHARGE/REFUND entries are the
// sales themselves; everything else is either a capital repayment or a fee.
export function summarizeWithholding(payout: SquarePayout): PayoutWithholding {
  let capital = 0;
  let fees = 0;
  const unhandled = new Set<string>();
  for (const e of payout.entries ?? []) {
    const gross = cents(e.gross_amount_money); // negative when Square keeps it
    switch (e.type) {
      case "CHARGE":
      case "REFUND":
        break;
      case "SQUARE_CAPITAL_PAYMENT":
      case "SQUARE_CAPITAL_REVERSED_PAYMENT":
        capital += -gross;
        break;
      case "GIFT_CARD_LOAD_FEE":
      case "DEPOSIT_FEE":
        fees += -gross;
        break;
      default:
        unhandled.add(e.type ?? "unknown");
    }
  }
  return { capitalRepaymentCents: capital, payoutFeeCents: fees, unhandledTypes: [...unhandled] };
}

// Square payout ids are "po_<uuid>". The uuid is what journal_entries.source_id
// (a uuid column) stores, so a payout can be looked up later.
export function payoutSourceId(payout: Pick<SquarePayout, "id">): string | null {
  const m = payout.id.match(/^po_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? m[1].toLowerCase() : null;
}
