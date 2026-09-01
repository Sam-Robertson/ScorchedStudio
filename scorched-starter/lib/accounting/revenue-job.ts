// lib/accounting/revenue-job.ts — server-only
//
// Posts one Denver-calendar-day of revenue (Square or Stripe) for one
// location. Idempotent via revenue_settlements.provider_key
// ('<provider>:<location>:<date>') — re-running a day that already posted
// is a no-op (skip-if-posted, not repost), so a cron retry or a manual
// backfill overlapping already-run days can't double-post revenue.
import { getSupabase } from "@/lib/supabase";
import { getSquareDailySettlement } from "@/lib/square-revenue";
import { getStripeDailySettlement } from "@/lib/stripe-revenue";
import { revenueSettlement } from "@/lib/accounting/templates";

// Only one Square location exists today (Orem). SLC gets a second entry
// here once it opens and has its own Square location.
export const SQUARE_LOCATION_MAP: Record<string, string> = {
  L09CTRSJRPFWY: "orem",
};

// Stripe bookings carry a `location` in PaymentIntent metadata, but reading
// it means an extra API call per transaction (Balance Transactions don't
// expose it directly) for a location that isn't bookable yet anyway.
// Everything posts to Orem until SLC opens and this needs revisiting.
export const STRIPE_DEFAULT_LOCATION_KEY = "orem";

export type RevenueJobResult =
  | { status: "posted"; journalEntryId: string; netSales: number }
  | { status: "skipped_no_activity" }
  | { status: "already_posted" };

type SettlementRow = {
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
  raw: unknown;
};

async function postSettlement(
  provider: "square" | "stripe",
  clearingAccountCode: string,
  locationKey: string,
  dateStr: string,
  row: SettlementRow
): Promise<RevenueJobResult> {
  const sb = getSupabase();
  const { data: location } = await sb.from("locations").select("id").eq("key", locationKey).single();

  const lines = revenueSettlement({
    clearingAccountCode,
    netSales: row.netSales,
    taxCollected: row.taxCollected,
    giftCardSales: row.giftCardSales,
    giftCardRedeemed: row.giftCardRedeemed,
    processingFees: row.processingFees,
    memo: `${provider[0].toUpperCase()}${provider.slice(1)} daily settlement ${dateStr}`,
  });

  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: dateStr,
    p_memo: `${provider[0].toUpperCase()}${provider.slice(1)} daily settlement ${dateStr}`,
    p_source: "revenue",
    p_source_id: null,
    p_template: "revenue_settlement",
    p_location_id: location?.id ?? null,
    p_created_by: `${provider}-revenue-job`,
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post_journal_entry failed for ${provider}:${locationKey}:${dateStr}: ${postErr.message}`);

  const providerKey = `${provider}:${locationKey}:${dateStr}`;
  const { error: upsertErr } = await sb.from("revenue_settlements").upsert(
    {
      provider,
      provider_key: providerKey,
      settle_date: dateStr,
      location_id: location?.id ?? null,
      gross_sales: row.grossSales,
      discounts: row.discounts,
      returns: row.returns,
      net_sales: row.netSales,
      tax_collected: row.taxCollected,
      tips: row.tips,
      gift_card_sales: row.giftCardSales,
      gift_card_redeemed: row.giftCardRedeemed,
      processing_fees: row.processingFees,
      cash_collected: row.cashCollected,
      raw: row.raw,
      journal_entry_id: entryId,
    },
    { onConflict: "provider_key" }
  );
  if (upsertErr) throw new Error(`revenue_settlements upsert failed for ${providerKey}: ${upsertErr.message}`);

  return { status: "posted", journalEntryId: entryId, netSales: row.netSales };
}

async function alreadyPosted(providerKey: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("revenue_settlements")
    .select("journal_entry_id")
    .eq("provider_key", providerKey)
    .maybeSingle();
  return !!data?.journal_entry_id;
}

export async function postSquareRevenueForDay(squareLocationId: string, locationKey: string, dateStr: string): Promise<RevenueJobResult> {
  if (await alreadyPosted(`square:${locationKey}:${dateStr}`)) return { status: "already_posted" };

  const settlement = await getSquareDailySettlement(squareLocationId, dateStr);
  const hadActivity =
    settlement.raw.orders.length > 0 ||
    settlement.raw.payments.length > 0 ||
    settlement.raw.refunds.length > 0 ||
    settlement.raw.giftCardActivities.length > 0;
  if (!hadActivity) return { status: "skipped_no_activity" };

  return postSettlement("square", "1100", locationKey, dateStr, {
    grossSales: settlement.grossSales,
    discounts: settlement.discounts,
    returns: settlement.returns,
    netSales: settlement.netSales,
    taxCollected: settlement.taxCollected,
    tips: settlement.tips,
    giftCardSales: settlement.giftCardSales,
    giftCardRedeemed: settlement.giftCardRedeemed,
    processingFees: settlement.processingFees,
    cashCollected: settlement.cashCollected,
    raw: settlement.raw,
  });
}

export async function postStripeRevenueForDay(dateStr: string, locationKey: string = STRIPE_DEFAULT_LOCATION_KEY): Promise<RevenueJobResult> {
  if (await alreadyPosted(`stripe:${locationKey}:${dateStr}`)) return { status: "already_posted" };

  const settlement = await getStripeDailySettlement(dateStr);
  if (settlement.raw.transactions.length === 0) return { status: "skipped_no_activity" };

  return postSettlement("stripe", "1110", locationKey, dateStr, {
    grossSales: settlement.grossSales,
    discounts: 0,
    returns: settlement.returns,
    netSales: settlement.netSales,
    taxCollected: 0,
    tips: 0,
    giftCardSales: 0,
    giftCardRedeemed: 0,
    processingFees: settlement.processingFees,
    cashCollected: 0,
    raw: settlement.raw,
  });
}
