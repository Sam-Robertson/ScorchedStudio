// One-time: resolves the "which Amex card is this ACH payment for" ambiguity
// that was flagged all session as unsolvable via ORIG ID alone. It turns out
// exact-amount matching against the card-side mirror ("AUTOPAY PAYMENT -
// THANK YOU", already auto-`ignore`d and invisible in the Inbox) is a
// reliable signal — Amex's autopay amount always equals exactly what's
// owed on that specific card that cycle, and two different cards owing the
// exact same odd-cent amount on the same day is effectively never a
// coincidence, EXCEPT the one case checked and excluded below.
//
// Excludes 2026-03-03's two $1,000 payments: both Amex cards show a $1,000
// mirror that day, so there's no way to tell which paid which — those stay
// in the inbox for a human.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { cardPayoff } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DAY_MS = 86400000;

async function main() {
  const { data: pending, error: pendingErr } = await sb
    .from("bank_transactions")
    .select("id, date, name, amount, bank_account_id, bank_accounts(accounts(code))")
    .eq("status", "unreviewed")
    .ilike("name", "%AMERICAN EXPRESS%ACH PMT%")
    .order("date");
  if (pendingErr) throw pendingErr;

  const { data: amexAccounts, error: amexErr } = await sb.from("accounts").select("id, code").in("code", ["2010", "2020"]);
  if (amexErr) throw amexErr;
  const { data: amexBankAccounts, error: baErr } = await sb
    .from("bank_accounts")
    .select("id, ledger_account_id")
    .in("ledger_account_id", amexAccounts.map((a) => a.id));
  if (baErr) throw baErr;
  const codeByBankAccountId = new Map(
    amexBankAccounts.map((ba) => [ba.id, amexAccounts.find((a) => a.id === ba.ledger_account_id)!.code])
  );

  const { data: mirrors, error: mirrorErr } = await sb
    .from("bank_transactions")
    .select("date, amount, bank_account_id")
    .lt("amount", 0)
    .in("bank_account_id", amexBankAccounts.map((ba) => ba.id))
    .or("name.ilike.%autopay%,name.ilike.%payment%");
  if (mirrorErr) throw mirrorErr;

  let posted = 0, skippedAmbiguous = 0, skippedNoMatch = 0;

  for (const p of pending ?? []) {
    const srcAccountCode = (p.bank_accounts as unknown as { accounts: { code: string } | null } | null)?.accounts?.code;
    if (!srcAccountCode) continue;

    const matches = (mirrors ?? []).filter(
      (m) => Math.abs(Number(m.amount)) === Math.abs(Number(p.amount)) && Math.abs(new Date(m.date).getTime() - new Date(p.date).getTime()) <= 3 * DAY_MS
    );
    const uniqueAccountIds = new Set(matches.map((m) => m.bank_account_id));

    if (uniqueAccountIds.size === 0) { skippedNoMatch++; continue; }
    if (uniqueAccountIds.size > 1) { skippedAmbiguous++; console.log(`  ambiguous, left in inbox: ${p.date} $${p.amount}`); continue; }

    const cardAccountCode = codeByBankAccountId.get([...uniqueAccountIds][0]);
    if (!cardAccountCode) { skippedNoMatch++; continue; }

    const lines = cardPayoff({ amount: Math.abs(Number(p.amount)), checkingAccountCode: srcAccountCode, cardAccountCode, memo: p.name });
    const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
      p_entry_date: p.date,
      p_memo: p.name,
      p_source: "bank",
      p_source_id: p.id,
      p_template: "card_payoff",
      p_location_id: null,
      p_created_by: "manual-confirmed",
      p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
    });
    if (postErr) { console.error(`  FAILED ${p.date} $${p.amount}: ${postErr.message}`); continue; }

    const { error: updateErr } = await sb.from("bank_transactions").update({ status: "posted", journal_entry_id: entryId }).eq("id", p.id);
    if (updateErr) throw updateErr;

    console.log(`posted ${p.date} $${p.amount} -> ${cardAccountCode}`);
    posted++;
  }

  console.log(`\nDone: ${posted} posted, ${skippedAmbiguous} left ambiguous, ${skippedNoMatch} had no mirror match.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
