// Phase 5 acceptance-test backfill (spec §9 step 2): imports the Square
// monthly Sales Summary CSV (Jan-Jul 2026, exported from the Square
// Dashboard) into revenue_settlements at month grain, since Plaid's own
// transaction history only reaches back to 2026-06-03 — these five months
// (Jan-May) plus partial June/July have no other path into the ledger.
// One combined entry per month, dated the 1st, distinct from the daily
// job's per-day keys so the two can never collide once the daily job's
// real coverage catches up in June.
//
// Reimplements postSettlement()'s logic inline rather than importing
// lib/accounting/revenue-job.ts directly: that module (and its Square/Stripe
// dependencies) uses "@/..." path aliases that only Next.js's bundler
// resolves — plain `node --experimental-strip-types` can't follow them.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { revenueSettlement } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function parseMoney(s: string): number {
  const negative = s.trim().startsWith("(");
  const cleaned = s.replace(/[\$,()]/g, "").trim();
  const n = parseFloat(cleaned || "0");
  return negative ? -n : n;
}

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error("Usage: node backfill_square_sales_summary.ts <path-to-csv>");
  process.exit(1);
}

const LOCATION_KEY = "orem";
const CLEARING_ACCOUNT_CODE = "1100";
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

type MonthRow = {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  taxCollected: number;
  giftCardSales: number;
  giftCardRedeemed: number;
  processingFees: number;
  cashCollected: number;
};

async function postMonth(monthKey: string, row: MonthRow) {
  const dateStr = `${monthKey}-01`;
  const providerKey = `square:${LOCATION_KEY}:${dateStr}`;

  const { data: existing } = await sb
    .from("revenue_settlements")
    .select("journal_entry_id")
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (existing?.journal_entry_id) {
    console.log(monthKey, "already_posted");
    return;
  }

  const { data: location } = await sb.from("locations").select("id").eq("key", LOCATION_KEY).single();
  const memo = `Square monthly settlement (CSV backfill) ${monthKey}`;

  const lines = revenueSettlement({
    clearingAccountCode: CLEARING_ACCOUNT_CODE,
    netSales: row.netSales,
    taxCollected: row.taxCollected,
    giftCardSales: row.giftCardSales,
    giftCardRedeemed: row.giftCardRedeemed,
    processingFees: row.processingFees,
    memo,
  });

  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: dateStr,
    p_memo: memo,
    p_source: "revenue",
    p_source_id: null,
    p_template: "revenue_settlement",
    p_location_id: location?.id ?? null,
    p_created_by: "square-sales-summary-backfill",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post_journal_entry failed for ${monthKey}: ${postErr.message}`);

  const { error: upsertErr } = await sb.from("revenue_settlements").upsert(
    {
      provider: "square",
      provider_key: providerKey,
      settle_date: dateStr,
      location_id: location?.id ?? null,
      gross_sales: row.grossSales,
      discounts: row.discounts,
      returns: row.returns,
      net_sales: row.netSales,
      tax_collected: row.taxCollected,
      tips: 0,
      gift_card_sales: row.giftCardSales,
      gift_card_redeemed: row.giftCardRedeemed,
      processing_fees: row.processingFees,
      cash_collected: row.cashCollected,
      raw: { source: "sales-summary-csv-backfill", monthKey },
      journal_entry_id: entryId,
    },
    { onConflict: "provider_key" }
  );
  if (upsertErr) throw new Error(`revenue_settlements upsert failed for ${monthKey}: ${upsertErr.message}`);

  console.log(monthKey, "posted", entryId, `netSales=${row.netSales}`);
}

function parseCsv(raw: string): Map<string, string[]> {
  const lines = raw.split("\n").map((l) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of l) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  });

  const rowByLabel = new Map<string, string[]>();
  for (const cells of lines) {
    const label = cells[0]?.trim();
    if (label) rowByLabel.set(label, cells.slice(1));
  }
  return rowByLabel;
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const rowByLabel = parseCsv(raw);

  const grossSalesRow = rowByLabel.get("Gross sales");
  const discountsRow = rowByLabel.get("Discounts & comps");
  const returnsRow = rowByLabel.get("Returns");
  const netSalesRow = rowByLabel.get("Net sales");
  const taxesRow = rowByLabel.get("Taxes");
  const giftCardSalesRow = rowByLabel.get("Gift card sales");
  const giftCardRedeemedRow = rowByLabel.get("Gift card redeemed");
  const feesRow = rowByLabel.get("Fees");
  const cashRow = rowByLabel.get("Cash");

  if (!grossSalesRow || !netSalesRow || !taxesRow) {
    throw new Error("CSV missing expected rows (Gross sales / Net sales / Taxes) — check the export format.");
  }

  for (let i = 0; i < MONTHS.length; i++) {
    const monthKey = MONTHS[i];
    await postMonth(monthKey, {
      grossSales: parseMoney(grossSalesRow[i] ?? "0"),
      discounts: Math.abs(parseMoney(discountsRow?.[i] ?? "0")),
      returns: Math.abs(parseMoney(returnsRow?.[i] ?? "0")),
      netSales: parseMoney(netSalesRow[i] ?? "0"),
      taxCollected: parseMoney(taxesRow[i] ?? "0"),
      giftCardSales: parseMoney(giftCardSalesRow?.[i] ?? "0"),
      giftCardRedeemed: parseMoney(giftCardRedeemedRow?.[i] ?? "0"),
      processingFees: Math.abs(parseMoney(feesRow?.[i] ?? "0")),
      cashCollected: parseMoney(cashRow?.[i] ?? "0"),
    });
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
