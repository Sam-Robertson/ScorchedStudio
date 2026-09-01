// lib/stripe-revenue.ts — server-only
//
// Aggregates one Denver-calendar-day of Stripe activity into the shape
// revenueSettlement() needs, mirroring lib/square-revenue.ts.
//
// Simpler than Square by design, not by omission — verified against real
// data and this codebase's checkout routes before writing it:
//   - No tax: bookings/memberships/courses charge a flat amount with no
//     Stripe Tax / tax_rate anywhere in the checkout code. tax_collected
//     is always 0 for Stripe.
//   - No gift cards: not a Stripe concept this business uses.
//   - One endpoint suffices. Balance Transactions already gives gross
//     amount, Stripe's own fee, and net, per transaction, bucketed by
//     `reporting_category` ('charge' covers both `type: charge` and
//     `type: payment` — both carry the same amount/fee/net shape; 'refund'
//     is separate and negative). No need for Charges + Refunds + a
//     separate fee lookup the way Square requires four endpoints.
import Stripe from "stripe";
import { denverDayRangeUTC } from "@/lib/timezone";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type DailyStripeSettlement = {
  grossSales: number;
  returns: number;
  netSales: number;
  processingFees: number;
  raw: { transactions: Stripe.BalanceTransaction[] };
};

function toDollars(c: number): number {
  return Math.round(c) / 100;
}

export async function getStripeDailySettlement(dateStr: string): Promise<DailyStripeSettlement> {
  const { startUTC, endUTC } = denverDayRangeUTC(dateStr);
  const gte = Math.floor(new Date(startUTC).getTime() / 1000);
  const lt = Math.floor(new Date(endUTC).getTime() / 1000);

  const transactions: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.balanceTransactions.list({
      created: { gte, lt },
      limit: 100,
      starting_after: startingAfter,
    });
    transactions.push(...page.data);
    startingAfter = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (startingAfter);

  let grossCents = 0;
  let feesCents = 0;
  let returnsCents = 0;
  for (const t of transactions) {
    if (t.reporting_category === "charge") {
      grossCents += t.amount;
      feesCents += t.fee;
    } else if (t.reporting_category === "refund") {
      returnsCents += -t.amount; // refund amounts are negative
    }
  }

  const netSalesCents = grossCents - returnsCents;

  return {
    grossSales: toDollars(grossCents),
    returns: toDollars(returnsCents),
    netSales: toDollars(netSalesCents),
    processingFees: toDollars(feesCents),
    raw: { transactions },
  };
}
