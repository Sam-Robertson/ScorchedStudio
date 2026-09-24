// Adds raw.summary (lib/accounting/settlement-summary.ts) to every Square
// settlement row that lacks it, so the Sales & Products and estimated
// bookings routes can read summaries instead of the full order payload.
// Safe to re-run: rows that already carry the current summary version are
// skipped. Add --force to recompute every row.
import { loadEnv } from "../load-env";
loadEnv();
import { createClient } from "@supabase/supabase-js";
import { summarizeSquareOrders, SUMMARY_VERSION } from "../../lib/accounting/settlement-summary";

const FORCE = process.argv.includes("--force");
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: rows, error } = await sb.from("revenue_settlements").select("id, settle_date, summary:raw->summary").eq("provider", "square").order("settle_date");
  if (error) throw error;
  let updated = 0, skipped = 0;
  for (const r of rows ?? []) {
    const existing = r.summary as { v?: number } | null;
    if (!FORCE && existing && existing.v === SUMMARY_VERSION) { skipped++; continue; }
    const { data: full, error: fullErr } = await sb.from("revenue_settlements").select("raw").eq("id", r.id).single();
    if (fullErr) throw fullErr;
    const raw = full.raw as Record<string, unknown> & { orders?: [] };
    const summary = summarizeSquareOrders(raw.orders ?? []);
    const { error: upErr } = await sb.from("revenue_settlements").update({ raw: { ...raw, summary } }).eq("id", r.id);
    if (upErr) throw upErr;
    updated++;
    if (updated % 50 === 0) console.log("updated", updated, "through", r.settle_date);
  }
  console.log({ updated, skipped });
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e); process.exit(1); });
