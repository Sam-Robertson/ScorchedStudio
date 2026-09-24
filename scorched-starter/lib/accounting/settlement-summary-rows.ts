// lib/accounting/settlement-summary-rows.ts (server-only)
//
// Loads Square settlement rows with just their summaries. Rows posted before
// raw.summary existed (or whose summary is an older version) get it computed
// from raw.orders on the fly, one row at a time so a handful of stragglers
// cannot turn back into the 19 MB fetch this replaces.
import { getSupabase } from "@/lib/supabase";
import { summarizeSquareOrders, SUMMARY_VERSION, type SettlementSummary, type SquareOrderLike } from "@/lib/accounting/settlement-summary";

export type SummaryRow = { settle_date: string; net_sales: number; summary: SettlementSummary };

export async function loadSquareSettlementSummaries(start: string | null, end: string | null): Promise<SummaryRow[]> {
  const sb = getSupabase();
  let query = sb
    .from("revenue_settlements")
    .select("id, settle_date, net_sales, summary:raw->summary")
    .eq("provider", "square")
    .order("settle_date");
  if (start) query = query.gte("settle_date", start);
  if (end) query = query.lte("settle_date", end);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows: SummaryRow[] = [];
  for (const r of data ?? []) {
    let summary = r.summary as SettlementSummary | null;
    if (!summary || summary.v !== SUMMARY_VERSION) {
      const { data: full, error: fullErr } = await sb.from("revenue_settlements").select("orders:raw->orders").eq("id", r.id).single();
      if (fullErr) throw new Error(fullErr.message);
      summary = summarizeSquareOrders((full?.orders ?? []) as SquareOrderLike[]);
    }
    rows.push({ settle_date: r.settle_date, net_sales: Number(r.net_sales), summary });
  }
  return rows;
}
