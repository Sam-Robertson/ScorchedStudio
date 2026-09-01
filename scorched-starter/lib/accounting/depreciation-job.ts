// lib/accounting/depreciation-job.ts — server-only
//
// Posts one combined monthly straight-line depreciation entry (Dr 7000
// Depreciation, Cr 1510 Accumulated Depreciation) for the sum of every
// active fixed asset still within its useful life. Idempotent via
// depreciation_runs.period_key ('YYYY-MM') — re-running mid-month is a
// no-op once that month has posted.
import { getSupabase } from "@/lib/supabase";
import { depreciation } from "@/lib/accounting/templates";

export type DepreciationJobResult =
  | { status: "posted"; journalEntryId: string; amount: number }
  | { status: "already_posted" }
  | { status: "no_assets" };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(fromDateStr: string, toYear: number, toMonth: number): number {
  const [fy, fm] = fromDateStr.split("-").map(Number);
  return (toYear - fy) * 12 + (toMonth - fm);
}

export async function postDepreciationForMonth(year: number, month: number): Promise<DepreciationJobResult> {
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const sb = getSupabase();

  const { data: existing } = await sb
    .from("depreciation_runs")
    .select("id")
    .eq("period_key", periodKey)
    .maybeSingle();
  if (existing) return { status: "already_posted" };

  const { data: assets, error: assetsErr } = await sb
    .from("fixed_assets")
    .select("id, cost, in_service_date, useful_life_months")
    .eq("status", "active");
  if (assetsErr) throw new Error(`fixed_assets fetch failed: ${assetsErr.message}`);

  let total = 0;
  for (const asset of assets ?? []) {
    const elapsed = monthsBetween(asset.in_service_date, year, month);
    if (elapsed < 0 || elapsed >= asset.useful_life_months) continue;
    total += round2(asset.cost / asset.useful_life_months);
  }
  total = round2(total);
  if (total <= 0) return { status: "no_assets" };

  const memo = `Depreciation ${periodKey}`;
  const lines = depreciation({ amount: total, memo });

  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: `${periodKey}-01`,
    p_memo: memo,
    p_source: "depreciation",
    p_source_id: null,
    p_template: "depreciation",
    p_location_id: null,
    p_created_by: "depreciation-job",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post_journal_entry failed for depreciation ${periodKey}: ${postErr.message}`);

  const { error: runErr } = await sb
    .from("depreciation_runs")
    .insert({ period_key: periodKey, amount: total, journal_entry_id: entryId });
  if (runErr) throw new Error(`depreciation_runs insert failed for ${periodKey}: ${runErr.message}`);

  return { status: "posted", journalEntryId: entryId, amount: total };
}
