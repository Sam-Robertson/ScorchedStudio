// One-time: posts the GL entry for the truck and Bluetti registered in
// scripts/register_fixed_assets.ts. That script only inserted rows into
// the fixed_assets subsidiary register — it never touched the ledger, so
// 1500 Fixed Assets was still $0 while depreciation had already started
// crediting 1510, which would show negative net fixed assets. This posts
// the missing Dr 1500 / Cr cash-or-card side, dated to the same reasoned
// placeholder date as the LiftFund opening entry (2026-04-01 — neither
// purchase appears in Plaid's history, which starts 2026-06-03).
//
// Bluetti was paid "on the credit cards" per the user, without specifying
// which — Amex Blue Business Plus (2010) is a guess, flagged as such.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { capex } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const memo = "Fixed asset capex (opening entry — predates Plaid history; truck/Bluetti cost and date are estimates)";
  const { data: existing } = await sb
    .from("journal_entries")
    .select("id")
    .eq("template", "capex")
    .eq("memo", memo)
    .maybeSingle();
  if (existing) {
    console.log("Already posted:", existing.id);
    return;
  }

  const truckLines = capex({ amount: 14000, srcAccountCode: "1000", memo: "Truck (estimate, cash withdrawal)" });
  const bluettiLines = capex({ amount: 1500, srcAccountCode: "2010", memo: "Bluetti power stations (estimate, credit card — which card unconfirmed)" });
  const lines = [...truckLines, ...bluettiLines];

  const { data: entryId, error } = await sb.rpc("post_journal_entry", {
    p_entry_date: "2026-04-01",
    p_memo: memo,
    p_source: "manual",
    p_source_id: null,
    p_template: "capex",
    p_location_id: null,
    p_created_by: "phase4-opening-balance",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (error) throw error;
  console.log("posted capex opening entry", entryId);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
