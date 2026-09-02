// One-time: posts the truck purchase and SLC (Salt Lake City) security
// deposit, both confirmed by the user against real bank transactions
// uncovered by the extended Plaid history — no estimates this time:
//   - Truck: $9,500 cash withdrawal, 2026-04-15, Chase checking.
//   - SLC deposit: $18,507.96 cash withdrawal, 2026-05-12, Chase checking.
// Deposits aren't fixed assets (§8: /deposits is its own register, doesn't
// depreciate) — only the truck gets a fixed_assets row + depreciation.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { capex, securityDeposit } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function postFor(bankTxnId: string, template: "capex" | "security_deposit", lines: ReturnType<typeof capex>, entryDate: string, memo: string) {
  const { data: existing } = await sb.from("bank_transactions").select("status, journal_entry_id").eq("id", bankTxnId).single();
  if (existing?.status === "posted") {
    console.log(`${bankTxnId} already posted (${existing.journal_entry_id}) — skipping`);
    return;
  }

  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: entryDate,
    p_memo: memo,
    p_source: "bank",
    p_source_id: bankTxnId,
    p_template: template,
    p_location_id: null,
    p_created_by: "manual-confirmed",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post failed for ${bankTxnId}: ${postErr.message}`);

  const { error: updateErr } = await sb
    .from("bank_transactions")
    .update({ status: "posted", journal_entry_id: entryId })
    .eq("id", bankTxnId);
  if (updateErr) throw updateErr;

  console.log(`posted ${template} for ${bankTxnId} -> journal_entry ${entryId}`);
  return entryId;
}

async function main() {
  await postFor(
    "59f3e23c-9472-445d-a056-be68f013325f",
    "capex",
    capex({ amount: 9500, srcAccountCode: "1000", memo: "Truck" }),
    "2026-04-15",
    "Truck"
  );

  const { data: fa, error: faErr } = await sb.from("fixed_assets").insert({
    description: "Truck",
    cost: 9500,
    in_service_date: "2026-04-15",
    useful_life_months: 60, // vehicles, per spec §5.6
    bank_transaction_id: "59f3e23c-9472-445d-a056-be68f013325f",
  }).select().single();
  if (faErr) throw faErr;
  console.log("registered fixed_assets row:", fa.id);

  await postFor(
    "3bc4cfc9-9f3e-4307-9fc4-2d6edc9da066",
    "security_deposit",
    securityDeposit({ amount: 18507.96, srcAccountCode: "1000", memo: "SLC (Walker Center) security deposit" }),
    "2026-05-12",
    "SLC (Walker Center) security deposit"
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
