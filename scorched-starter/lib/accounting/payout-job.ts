// lib/accounting/payout-job.ts — server-only
//
// Posts what Square withheld from each paid payout: Square Capital
// repayments (Dr 2510 Square Capital Advance) and payout-level fees
// (Dr 6300 Payment Processing Fees), both credited out of 1100 Square
// Clearing so the clearing balance keeps tracking real deposits.
//
// Idempotent on journal_entries (source = 'loan', source_id = the uuid
// inside Square's payout id "po_<uuid>"): a payout that already has an
// entry is skipped, so the daily lookback can overlap freely. The
// September 2026 audit backfill used this same key for every payout from
// August 2025 on, so nothing before the lookback window is missed either.
import { getSupabase } from "@/lib/supabase";
import { listPaidPayoutsWithEntries } from "@/lib/square-payouts";
import { payoutSourceId, summarizeWithholding } from "@/lib/accounting/payouts";
import { denverDateKey, denverDayRangeUTC } from "@/lib/timezone";

export const SQUARE_CAPITAL_ACCOUNT = "2510";
export const SQUARE_CLEARING_ACCOUNT = "1100";
export const PROCESSING_FEES_ACCOUNT = "6300";

export type PayoutJobResult = {
  checked: number;
  posted: number;
  skipped: number;
  capitalRepaid: number; // dollars
  payoutFees: number; // dollars
  unhandledTypes: string[];
  errors: string[];
};

export async function postSquarePayoutWithholdings(
  squareLocationId: string,
  fromDate: string, // YYYY-MM-DD, Denver
  toDate: string
): Promise<PayoutJobResult> {
  const sb = getSupabase();
  const { startUTC } = denverDayRangeUTC(fromDate);
  const { endUTC } = denverDayRangeUTC(toDate);
  const payouts = await listPaidPayoutsWithEntries(squareLocationId, startUTC, endUTC);

  const result: PayoutJobResult = { checked: payouts.length, posted: 0, skipped: 0, capitalRepaid: 0, payoutFees: 0, unhandledTypes: [], errors: [] };
  if (payouts.length === 0) return result;

  const sourceIds = payouts.map(payoutSourceId).filter((s): s is string => !!s);
  const { data: existing, error: existingErr } = await sb
    .from("journal_entries")
    .select("source_id")
    .eq("source", "loan")
    .in("source_id", sourceIds);
  if (existingErr) throw new Error(`payout job: could not read existing entries: ${existingErr.message}`);
  const have = new Set((existing ?? []).map((e) => e.source_id as string));

  for (const payout of payouts) {
    const sourceId = payoutSourceId(payout);
    if (!sourceId) { result.errors.push(`unrecognised payout id ${payout.id}`); continue; }
    if (have.has(sourceId)) { result.skipped++; continue; }

    const w = summarizeWithholding(payout);
    for (const t of w.unhandledTypes) if (!result.unhandledTypes.includes(t)) result.unhandledTypes.push(t);
    if (w.capitalRepaymentCents === 0 && w.payoutFeeCents === 0) { result.skipped++; continue; }

    const lines: { account_code: string; amount: number; memo: string }[] = [];
    if (w.capitalRepaymentCents !== 0) {
      lines.push({ account_code: SQUARE_CAPITAL_ACCOUNT, amount: w.capitalRepaymentCents / 100, memo: "Square Capital repayment withheld from payout" });
    }
    if (w.payoutFeeCents !== 0) {
      lines.push({ account_code: PROCESSING_FEES_ACCOUNT, amount: w.payoutFeeCents / 100, memo: "Square payout fees (gift card load / deposit)" });
    }
    lines.push({ account_code: SQUARE_CLEARING_ACCOUNT, amount: -(w.capitalRepaymentCents + w.payoutFeeCents) / 100, memo: `Square payout ${payout.id}` });

    const { error: postErr } = await sb.rpc("post_journal_entry", {
      p_entry_date: denverDateKey(payout.created_at),
      p_memo: `Square payout ${payout.id}: capital repayment / payout fees`,
      p_source: "loan",
      p_source_id: sourceId,
      p_template: "loan_payment",
      p_location_id: null,
      p_created_by: "square-payout-job",
      p_lines: lines,
    });
    if (postErr) { result.errors.push(`${payout.id}: ${postErr.message}`); continue; }

    result.posted++;
    result.capitalRepaid += w.capitalRepaymentCents / 100;
    result.payoutFees += w.payoutFeeCents / 100;
  }
  result.capitalRepaid = Math.round(result.capitalRepaid * 100) / 100;
  result.payoutFees = Math.round(result.payoutFees * 100) / 100;
  return result;
}
