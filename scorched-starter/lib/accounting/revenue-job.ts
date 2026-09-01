// lib/accounting/revenue-job.ts — server-only
//
// Posts one Denver-calendar-day of Square revenue for one location.
// Idempotent via revenue_settlements.provider_key ('square:<location>:<date>')
// — re-running a day that already posted is a no-op (skip-if-posted, not
// repost), so a cron retry or a manual backfill overlapping already-run
// days can't double-post revenue.
import { getSupabase } from "@/lib/supabase";
import { getSquareDailySettlement } from "@/lib/square-revenue";
import { revenueSettlement } from "@/lib/accounting/templates";

// Only one Square location exists today (Orem). SLC gets a second entry
// here once it opens and has its own Square location.
export const SQUARE_LOCATION_MAP: Record<string, string> = {
  L09CTRSJRPFWY: "orem",
};

export type RevenueJobResult =
  | { status: "posted"; journalEntryId: string; netSales: number }
  | { status: "skipped_no_activity" }
  | { status: "already_posted" };

export async function postSquareRevenueForDay(squareLocationId: string, locationKey: string, dateStr: string): Promise<RevenueJobResult> {
  const sb = getSupabase();
  const providerKey = `square:${locationKey}:${dateStr}`;

  const { data: existing } = await sb
    .from("revenue_settlements")
    .select("id, journal_entry_id")
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (existing?.journal_entry_id) return { status: "already_posted" };

  const settlement = await getSquareDailySettlement(squareLocationId, dateStr);
  const hadActivity =
    settlement.raw.orders.length > 0 ||
    settlement.raw.payments.length > 0 ||
    settlement.raw.refunds.length > 0 ||
    settlement.raw.giftCardActivities.length > 0;
  if (!hadActivity) return { status: "skipped_no_activity" };

  const { data: location } = await sb.from("locations").select("id").eq("key", locationKey).single();

  const lines = revenueSettlement({
    clearingAccountCode: "1100",
    netSales: settlement.netSales,
    taxCollected: settlement.taxCollected,
    giftCardSales: settlement.giftCardSales,
    giftCardRedeemed: settlement.giftCardRedeemed,
    processingFees: settlement.processingFees,
    memo: `Square daily settlement ${dateStr}`,
  });

  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: dateStr,
    p_memo: `Square daily settlement ${dateStr}`,
    p_source: "revenue",
    p_source_id: null,
    p_template: "revenue_settlement",
    p_location_id: location?.id ?? null,
    p_created_by: "square-revenue-job",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post_journal_entry failed for ${providerKey}: ${postErr.message}`);

  const { error: upsertErr } = await sb.from("revenue_settlements").upsert(
    {
      provider: "square",
      provider_key: providerKey,
      settle_date: dateStr,
      location_id: location?.id ?? null,
      gross_sales: settlement.grossSales,
      discounts: settlement.discounts,
      returns: settlement.returns,
      net_sales: settlement.netSales,
      tax_collected: settlement.taxCollected,
      tips: settlement.tips,
      gift_card_sales: settlement.giftCardSales,
      gift_card_redeemed: settlement.giftCardRedeemed,
      processing_fees: settlement.processingFees,
      cash_collected: settlement.cashCollected,
      raw: settlement.raw,
      journal_entry_id: entryId,
    },
    { onConflict: "provider_key" }
  );
  if (upsertErr) throw new Error(`revenue_settlements upsert failed for ${providerKey}: ${upsertErr.message}`);

  return { status: "posted", journalEntryId: entryId, netSales: settlement.netSales };
}
