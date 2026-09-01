// lib/square-revenue.ts — server-only
//
// Aggregates one Denver-calendar-day of Square activity (Orders, Payments,
// Refunds, Gift Card Activities) into the shape revenueSettlement() (see
// lib/accounting/templates.ts) needs, and the fuller shape the
// revenue_settlements table records for audit.
//
// Two things verified against real data before writing this, not assumed:
//   1. A gift card purchase shows up as a normal Order line item with
//      item_type 'GIFT_CARD' — summing all line items' gross_sales_money
//      would double-count it as revenue on top of the separate gift-card
//      leg. Excluded here.
//   2. A gift card *redemption* is a tender on an otherwise-normal order
//      (paying for real items) — the Gift Card Activities API's REDEEM
//      entries reference a payment_id, not a new order, so no separate
//      exclusion is needed for that side; the underlying items' revenue is
//      already correctly included.
import { squareFetch } from "@/lib/square";
import { denverDayRangeUTC } from "@/lib/timezone";

type Money = { amount?: number; currency?: string } | null | undefined;
function cents(m: Money): number {
  return m?.amount ?? 0;
}

type SquareLineItem = {
  item_type?: string;
  gross_sales_money?: Money;
};

type SquareOrder = {
  id: string;
  total_discount_money?: Money;
  total_tax_money?: Money;
  total_tip_money?: Money;
  total_service_charge_money?: Money;
  line_items?: SquareLineItem[];
};

type SquarePayment = {
  status?: string;
  source_type?: string;
  amount_money?: Money;
  tip_money?: Money;
  processing_fee?: { amount_money?: Money }[];
};

type SquareRefund = {
  status?: string;
  amount_money?: Money;
};

type SquareGiftCardActivity = {
  type?: string;
  activate_activity_details?: { amount_money?: Money };
  redeem_activity_details?: { amount_money?: Money };
};

async function searchOrdersForRange(locationId: string, startUTC: string, endUTC: string): Promise<SquareOrder[]> {
  const orders: SquareOrder[] = [];
  let cursor: string | undefined;
  do {
    const data = await squareFetch<{ orders?: SquareOrder[]; cursor?: string }>("/v2/orders/search", {
      method: "POST",
      body: JSON.stringify({
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: { closed_at: { start_at: startUTC, end_at: endUTC } },
            state_filter: { states: ["COMPLETED"] },
          },
          sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
        },
        limit: 100,
        cursor,
      }),
    });
    orders.push(...(data.orders ?? []));
    cursor = data.cursor;
  } while (cursor);
  return orders;
}

async function listPaymentsForRange(locationId: string, startUTC: string, endUTC: string): Promise<SquarePayment[]> {
  const payments: SquarePayment[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      location_id: locationId,
      begin_time: startUTC,
      end_time: endUTC,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const data = await squareFetch<{ payments?: SquarePayment[]; cursor?: string }>(`/v2/payments?${qs}`, { method: "GET" });
    payments.push(...(data.payments ?? []));
    cursor = data.cursor;
  } while (cursor);
  return payments;
}

async function listRefundsForRange(locationId: string, startUTC: string, endUTC: string): Promise<SquareRefund[]> {
  const refunds: SquareRefund[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      location_id: locationId,
      begin_time: startUTC,
      end_time: endUTC,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const data = await squareFetch<{ refunds?: SquareRefund[]; cursor?: string }>(`/v2/refunds?${qs}`, { method: "GET" });
    refunds.push(...(data.refunds ?? []));
    cursor = data.cursor;
  } while (cursor);
  return refunds;
}

async function listGiftCardActivitiesForRange(locationId: string, startUTC: string, endUTC: string): Promise<SquareGiftCardActivity[]> {
  const activities: SquareGiftCardActivity[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      location_id: locationId,
      begin_time: startUTC,
      end_time: endUTC,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const data = await squareFetch<{ gift_card_activities?: SquareGiftCardActivity[]; cursor?: string }>(
      `/v2/gift-cards/activities?${qs}`,
      { method: "GET" }
    );
    activities.push(...(data.gift_card_activities ?? []));
    cursor = data.cursor;
  } while (cursor);
  return activities;
}

export type DailySettlement = {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  taxCollected: number;
  tips: number;
  giftCardSales: number;
  giftCardRedeemed: number;
  processingFees: number;
  cashCollected: number;
  raw: { orders: SquareOrder[]; payments: SquarePayment[]; refunds: SquareRefund[]; giftCardActivities: SquareGiftCardActivity[] };
};

// dollars, not cents — matches every other money value in this codebase
function toDollars(c: number): number {
  return Math.round(c) / 100;
}

export async function getSquareDailySettlement(locationId: string, dateStr: string): Promise<DailySettlement> {
  const { startUTC, endUTC } = denverDayRangeUTC(dateStr);

  const [orders, payments, refunds, giftCardActivities] = await Promise.all([
    searchOrdersForRange(locationId, startUTC, endUTC),
    listPaymentsForRange(locationId, startUTC, endUTC),
    listRefundsForRange(locationId, startUTC, endUTC),
    listGiftCardActivitiesForRange(locationId, startUTC, endUTC),
  ]);

  let grossSalesCents = 0;
  let discountsCents = 0;
  let taxCents = 0;
  let tipsCents = 0;
  for (const o of orders) {
    for (const li of o.line_items ?? []) {
      if (li.item_type === "GIFT_CARD") continue; // liability, not revenue — see file header
      grossSalesCents += cents(li.gross_sales_money);
    }
    discountsCents += cents(o.total_discount_money);
    taxCents += cents(o.total_tax_money);
    tipsCents += cents(o.total_tip_money);
  }

  let returnsCents = 0;
  for (const r of refunds) {
    if (r.status === "COMPLETED") returnsCents += cents(r.amount_money);
  }

  let processingFeesCents = 0;
  let cashCollectedCents = 0;
  for (const p of payments) {
    if (p.status !== "COMPLETED") continue;
    for (const f of p.processing_fee ?? []) processingFeesCents += cents(f.amount_money);
    if (p.source_type === "CASH") cashCollectedCents += cents(p.amount_money) + cents(p.tip_money);
  }

  let giftCardSalesCents = 0;
  let giftCardRedeemedCents = 0;
  for (const a of giftCardActivities) {
    if (a.type === "ACTIVATE") giftCardSalesCents += cents(a.activate_activity_details?.amount_money);
    else if (a.type === "REDEEM") giftCardRedeemedCents += cents(a.redeem_activity_details?.amount_money);
  }

  const netSalesCents = grossSalesCents - discountsCents - returnsCents;

  return {
    grossSales: toDollars(grossSalesCents),
    discounts: toDollars(discountsCents),
    returns: toDollars(returnsCents),
    netSales: toDollars(netSalesCents),
    taxCollected: toDollars(taxCents),
    tips: toDollars(tipsCents),
    giftCardSales: toDollars(giftCardSalesCents),
    giftCardRedeemed: toDollars(giftCardRedeemedCents),
    processingFees: toDollars(processingFeesCents),
    cashCollected: toDollars(cashCollectedCents),
    raw: { orders, payments, refunds, giftCardActivities },
  };
}
