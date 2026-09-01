import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(
  "/Users/samrobertson/Desktop/Code/Scorched Code/scorched-starter/.env",
  "utf8"
).split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SQ_RULE_ID = "1459a675-7dce-42aa-9a96-ded0397fc644";
const IRS_RULE_ID = "21bb7e8d-57ab-4c70-aaf1-9c7fa636cc96";

async function main() {
  const { data: accts, error: acctErr } = await sb
    .from("accounts")
    .select("id,code")
    .in("code", ["6000", "6010"]);
  if (acctErr) throw acctErr;
  const wagesId = accts.find((a) => a.code === "6000").id;
  const taxId = accts.find((a) => a.code === "6010").id;

  const { data: btsBefore, error: btsErr } = await sb
    .from("bank_transactions")
    .select("id, journal_entry_id, rule_id")
    .in("rule_id", [SQ_RULE_ID, IRS_RULE_ID])
    .eq("status", "posted");
  if (btsErr) throw btsErr;
  console.log("rows to repoint:", btsBefore.length);

  const entryIds = btsBefore.map((b) => b.journal_entry_id).filter(Boolean);
  console.log("journal entries to delete:", entryIds.length);

  // 1. Update the two rules to the fallback expense targets.
  const { error: e1 } = await sb
    .from("categorization_rules")
    .update({ template: "expense", target_account_id: wagesId })
    .eq("id", SQ_RULE_ID);
  if (e1) throw e1;
  const { error: e2 } = await sb
    .from("categorization_rules")
    .update({ template: "expense", target_account_id: taxId })
    .eq("id", IRS_RULE_ID);
  if (e2) throw e2;
  console.log("rules updated");

  // 2. Clear the FK from bank_transactions first (it references journal_entries).
  const btIds = btsBefore.map((b) => b.id);
  const { error: resetErr } = await sb
    .from("bank_transactions")
    .update({ status: "unreviewed", journal_entry_id: null, rule_id: null })
    .in("id", btIds);
  if (resetErr) throw resetErr;
  console.log("reset", btIds.length, "bank_transactions to unreviewed");

  // 3. Delete the old payroll_clearing journal entries (cascades to journal_lines).
  const { error: delErr } = await sb.from("journal_entries").delete().in("id", entryIds);
  if (delErr) throw delErr;
  console.log("deleted", entryIds.length, "journal entries");
}

main().then(() => {
  console.log("done");
  process.exit(0);
}).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
