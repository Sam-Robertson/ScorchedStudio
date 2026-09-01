// One-time: books the LiftFund $21,000 draw that predates Plaid's
// transaction history (funded 2026-04-01; earliest synced bank data is
// 2026-06-03), so the 2500 LiftFund Loan liability reflects the real
// amount owed rather than only the principal reduction from payments
// made after the ledger's start. Confirmed with the user before running.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { loanProceeds } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const memo = "LiftFund loan proceeds (opening entry — predates Plaid history)";
  const { data: existing } = await sb
    .from("journal_entries")
    .select("id")
    .eq("template", "loan_proceeds")
    .eq("memo", memo)
    .maybeSingle();
  if (existing) {
    console.log("Opening entry already posted:", existing.id);
    return;
  }

  const lines = loanProceeds({ amount: 21000, srcAccountCode: "1000", loanAccountCode: "2500", memo });

  const { data: entryId, error } = await sb.rpc("post_journal_entry", {
    p_entry_date: "2026-04-01",
    p_memo: memo,
    p_source: "manual",
    p_source_id: null,
    p_template: "loan_proceeds",
    p_location_id: null,
    p_created_by: "phase4-opening-balance",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (error) throw error;
  console.log("posted opening entry", entryId);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
