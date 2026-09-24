// See README.md in this folder. Dry run unless --apply is passed.
import { loadEnv } from "../load-env";
loadEnv();
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const REWARD_PATTERN = /YOUR CASH REWARD\/REFUND IS|PAYYOURSELFBACK CREDIT|^STATEMENT CREDIT$/i;
const MISC_ACCOUNT = "6900";

async function main() {
  const { data: txns, error } = await sb
    .from("bank_transactions")
    .select("id, date, amount, name, status, journal_entry_id, rule_id, location_id, bank_accounts(accounts(code)), journal_entries(template, journal_lines(amount, accounts(code)))")
    .eq("status", "posted")
    .lt("amount", 0);
  if (error) throw error;

  type Row = typeof txns[number] & { bank_accounts: { accounts: { code: string } } | null; journal_entries: { template: string; journal_lines: { amount: number; accounts: { code: string } }[] } | null };
  const targets = (txns as Row[]).filter((t) => REWARD_PATTERN.test(t.name ?? "") && t.journal_entries?.template === "card_payoff");
  console.log(`${targets.length} reward/statement credits posted as card_payoff:`);
  for (const t of targets) {
    const codes = new Set(t.journal_entries!.journal_lines.map((l) => l.accounts.code));
    const noOp = codes.size === 1;
    console.log("  ", t.date, t.amount, t.name, "lines:", t.journal_entries!.journal_lines.map((l) => `${l.accounts.code} ${l.amount}`).join(" | "), noOp ? "(no-op)" : "(NOT a no-op, skipping)");
    if (!noOp) continue;
    const cardCode = t.bank_accounts!.accounts.code;
    const amount = Math.abs(Number(t.amount));
    const lines = [
      { account_code: cardCode, amount: amount, memo: t.name },
      { account_code: MISC_ACCOUNT, amount: -amount, memo: t.name },
    ];
    if (!APPLY) { console.log("      would re-post as", JSON.stringify(lines)); continue; }
    await sb.from("bank_transactions").update({ journal_entry_id: null }).eq("id", t.id);
    const { error: delErr } = await sb.from("journal_entries").delete().eq("id", t.journal_entry_id);
    if (delErr) throw delErr;
    const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
      p_entry_date: t.date, p_memo: t.name, p_source: "bank", p_source_id: t.id, p_template: "expense",
      p_location_id: t.location_id, p_created_by: "audit-2026-09", p_lines: lines,
    });
    if (postErr) throw postErr;
    await sb.from("bank_transactions").update({ journal_entry_id: entryId }).eq("id", t.id);
    console.log("      re-posted as", entryId);
  }

  const { data: rules } = await sb.from("categorization_rules").select("id, match_regex, template, target_account_id").eq("template", "card_payoff");
  const { data: misc } = await sb.from("accounts").select("id").eq("code", MISC_ACCOUNT).single();
  for (const r of rules ?? []) {
    if (!REWARD_PATTERN.test(r.match_regex.replace(/\\\//g, "/"))) continue;
    console.log("rule", r.id, r.match_regex, "-> expense", MISC_ACCOUNT);
    if (APPLY) await sb.from("categorization_rules").update({ template: "expense", target_account_id: misc!.id }).eq("id", r.id);
  }
  if (!APPLY) console.log("dry run: pass --apply to make these changes");
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e); process.exit(1); });
