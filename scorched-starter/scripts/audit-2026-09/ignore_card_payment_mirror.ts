// The "Payment Thank You - Web" credit of 2026-09-01 on the Chase Ink feed is
// the card's own record of a payment already posted from checking. It was
// categorised as an expense; this marks it ignored, removes that entry, and
// widens the card-payment ignore rule so the descriptor is skipped next time.
// Owner asked for this on 2026-09-24.
import { loadEnv } from "../load-env";
loadEnv();
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: txn, error } = await sb.from("bank_transactions").select("id, journal_entry_id, status, amount, date")
    .eq("name", "Payment Thank You - Web").eq("date", "2026-09-01").single();
  if (error) throw error;
  console.log("transaction", txn);
  if (txn.journal_entry_id) {
    const { error: u } = await sb.from("bank_transactions").update({ status: "ignored", journal_entry_id: null, rule_id: null }).eq("id", txn.id);
    if (u) throw u;
    const { error: d } = await sb.from("journal_entries").delete().eq("id", txn.journal_entry_id);
    if (d) throw d;
    console.log("entry removed, transaction ignored");
  }
  const { data: rule, error: rErr } = await sb.from("categorization_rules").select("id, match_regex").eq("template", "ignore").eq("priority", 15).single();
  if (rErr) throw rErr;
  if (!/Payment Thank You - Web/.test(rule.match_regex)) {
    const { error: ru } = await sb.from("categorization_rules").update({ match_regex: rule.match_regex + "|Payment Thank You - Web" }).eq("id", rule.id);
    if (ru) throw ru;
    console.log("ignore rule widened");
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e); process.exit(1); });
