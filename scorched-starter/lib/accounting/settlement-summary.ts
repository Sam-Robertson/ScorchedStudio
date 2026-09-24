// lib/accounting/settlement-summary.ts
//
// A compact per-day summary of a Square settlement's orders, stored inside
// revenue_settlements.raw as raw.summary at post time. The Sales & Products
// and estimated-bookings routes read only this (via PostgREST's raw->summary
// projection) instead of the full order payload: for the ALL range that
// payload is about 19 MB and took 20 seconds to fetch, which is past the
// serverless function's time limit, so the Overview page showed 500s.
//
// Pure and import-free so it is unit-testable like templates.ts.

export type SquareOrderLineItem = {
  name?: string;
  note?: string;
  quantity?: string;
  item_type?: string;
  gross_sales_money?: { amount?: number; currency?: string } | null;
};
export type SquareOrderLike = { state?: string; line_items?: SquareOrderLineItem[] };

export type SettlementSummary = {
  v: 1;
  orders: number; // COMPLETED orders that day
  items: number; // line-item quantity, gift card lines excluded
  grossCents: number; // gross line-item sales, gift card lines excluded
  itemRevenueCents: Record<string, number>; // by line-item name
  itemQty: Record<string, number>;
  admissionOrders: number; // orders carrying a "General Admission" line (pre-launch booking proxy)
  admissionSeats: number;
};

export const SUMMARY_VERSION = 1 as const;

export function summarizeSquareOrders(orders: SquareOrderLike[] | undefined): SettlementSummary {
  const s: SettlementSummary = { v: SUMMARY_VERSION, orders: 0, items: 0, grossCents: 0, itemRevenueCents: {}, itemQty: {}, admissionOrders: 0, admissionSeats: 0 };
  for (const order of orders ?? []) {
    if (order.state !== "COMPLETED") continue;
    s.orders++;
    let admissionSeats = 0;
    for (const li of order.line_items ?? []) {
      const qty = parseFloat(li.quantity ?? "1") || 1;
      // Same rule as lib/square-revenue.ts: a gift card sale is deferred
      // revenue, not an item sold.
      if (li.item_type === "GIFT_CARD") continue;
      if ((li.name ?? "").includes("General Admission")) admissionSeats += qty;
      const cents = li.gross_sales_money?.amount ?? 0;
      // Nameless line items are CUSTOM_AMOUNT register charges (ad-hoc
      // amounts rung up without a catalog item); use the register note when
      // the cashier left one.
      const name = li.name ?? (li.note?.trim() || "Custom Amount");
      s.items += qty;
      s.grossCents += cents;
      s.itemRevenueCents[name] = (s.itemRevenueCents[name] ?? 0) + cents;
      s.itemQty[name] = (s.itemQty[name] ?? 0) + qty;
    }
    if (admissionSeats > 0) { s.admissionOrders++; s.admissionSeats += admissionSeats; }
  }
  s.items = Math.round(s.items * 100) / 100;
  return s;
}
