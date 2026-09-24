// See README.md in this folder. Dry run unless --apply is passed.
import { loadEnv } from "../load-env";
loadEnv();
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: entries, error } = await sb
    .from("journal_entries")
    .select("id, entry_date, memo, source, template, created_by, journal_lines(amount, accounts(code))")
    .eq("source", "manual")
    .eq("template", "loan_proceeds")
    .eq("entry_date", "2026-04-01");
  if (error) throw error;
  if (!entries || entries.length !== 1) throw new Error(`expected exactly one manual loan_proceeds entry on 2026-04-01, found ${entries?.length ?? 0}`);
  const entry = entries[0];
  console.log("manual opening entry:", entry.id, entry.memo);
  for (const l of entry.journal_lines as unknown as { amount: number; accounts: { code: string } | null }[]) console.log("   ", l.accounts?.code, l.amount);

  const { data: bankFunding } = await sb
    .from("bank_transactions")
    .select("id, date, amount, name, status, journal_entry_id")
    .ilike("name", "%LIFTFUND%ACH FUN%");
  console.log("bank-fed funding transaction(s):", bankFunding);
  if (!bankFunding?.some((t) => t.status === "posted" && t.journal_entry_id)) throw new Error("bank-fed LiftFund funding is not posted; do not remove the manual entry");

  if (!APPLY) { console.log("dry run: would delete journal entry", entry.id, "(pass --apply to do it)"); return; }
  const { error: delErr } = await sb.from("journal_entries").delete().eq("id", entry.id);
  if (delErr) throw delErr;
  console.log("deleted", entry.id);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e); process.exit(1); });
