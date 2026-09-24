// Replaces the two 2026-09-02 Amex "balance correction" write-offs with what
// actually happened (see docs/accounting/audit-2026-09-24.md, Amex section).
// Dry run unless --apply is passed.
//
//  1. Two Chase payments were posted as payoffs of Blue Business Plus (2010)
//     but the Blue Business Cash (2020) feed shows them arriving there:
//     $1,000.00 on 2026-03-03 and $1,965.32 on 2026-05-21. Repoint the
//     debit line of each entry from 2010 to 2020.
//  2. Blue Business Plus received $13,498.92 of payments that never left
//     Chase checking (fourteen card-feed payments, mostly Aug-Sep 2025):
//     paid from Sam's personal account. That is an owner contribution, not
//     a retained-earnings write-off.
//  3. With 1 and 2 in place the Blue Business Cash write-off is not needed
//     at all: its whole gap was the two misdirected payments plus a
//     payment still sitting in the Inbox (4).
//  4. Post the $1,112.06 Chase payment of 2026-09-14 (unreviewed) as a
//     payoff of 2020; the 2020 feed shows the matching autopay on 09-12.
import { loadEnv } from "../load-env";
loadEnv();
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PERSONAL_PAYMENTS = 13498.92;

async function accountId(code: string) {
  const { data, error } = await sb.from("accounts").select("id").eq("code", code).single();
  if (error) throw error;
  return data.id as string;
}

async function main() {
  const a2010 = await accountId("2010"), a2020 = await accountId("2020");

  // 1. repoint the two misdirected payoffs
  const { data: candidates, error: cErr } = await sb
    .from("bank_transactions")
    .select("id, date, amount, name, journal_entry_id")
    .eq("status", "posted")
    .ilike("name", "%AMERICAN EXPRESS%");
  if (cErr) throw cErr;
  const misdirected = (candidates ?? []).filter((t) =>
    (t.date === "2026-03-03" && Number(t.amount) === 1000 && /M4634/.test(t.name ?? "")) ||
    (Number(t.amount) === 1965.32 && /RETRY PYMT/.test(t.name ?? "")));
  if (misdirected.length !== 2) throw new Error(`expected 2 misdirected payments, found ${misdirected.length}: ${JSON.stringify(misdirected)}`);
  for (const t of misdirected) {
    const { data: ls } = await sb.from("journal_lines").select("id, amount, account_id").eq("entry_id", t.journal_entry_id).eq("account_id", a2010);
    if (!ls || ls.length !== 1 || Number(ls[0].amount) !== Number(t.amount)) throw new Error(`entry ${t.journal_entry_id} does not have the expected Dr 2010 line`);
    console.log(`1. ${t.date} $${t.amount}: move Dr line ${ls[0].id} from 2010 to 2020`);
    if (APPLY) { const { error } = await sb.from("journal_lines").update({ account_id: a2020 }).eq("id", ls[0].id); if (error) throw error; }
  }

  // 2 + 3. the two write-offs
  const { data: writeoffs, error: wErr } = await sb
    .from("journal_entries").select("id, memo, journal_lines(amount, account_id)")
    .eq("template", "balance_correction").eq("entry_date", "2026-09-02");
  if (wErr) throw wErr;
  if (!writeoffs || writeoffs.length !== 2) throw new Error(`expected 2 write-offs, found ${writeoffs?.length}`);
  for (const w of writeoffs) {
    const card = w.journal_lines.find((l: { account_id: string }) => l.account_id === a2010 || l.account_id === a2020);
    const which = card?.account_id === a2010 ? "2010" : "2020";
    console.log(`2/3. delete ${which} write-off ${w.id} ($${card?.amount})`);
    if (APPLY) { const { error } = await sb.from("journal_entries").delete().eq("id", w.id); if (error) throw error; }
  }
  console.log(`2. post 2026-09-02: Dr 2010 ${PERSONAL_PAYMENTS} / Cr 3000 ${PERSONAL_PAYMENTS} (payments from personal account)`);
  if (APPLY) {
    const { error } = await sb.rpc("post_journal_entry", {
      p_entry_date: "2026-09-02",
      p_memo: "Amex Blue Business Plus payments made from Sam's personal account, Aug 2025 to May 2026 (14 payments seen on the card feed with no matching Chase debit). Replaces the 2026-09-02 retained-earnings write-off.",
      p_source: "manual", p_source_id: null, p_template: "owner_contribution", p_location_id: null, p_created_by: "admin-confirmed",
      p_lines: [
        { account_code: "2010", amount: PERSONAL_PAYMENTS, memo: "Card payments from personal funds" },
        { account_code: "3000", amount: -PERSONAL_PAYMENTS, memo: "Owner contribution: Amex Plus paid from personal funds" },
      ],
    });
    if (error) throw error;
  }

  // 4. the inbox payment
  const { data: inbox, error: iErr } = await sb.from("bank_transactions")
    .select("id, date, amount, name, location_id, bank_accounts(accounts(code))")
    .eq("status", "unreviewed").eq("date", "2026-09-14").eq("amount", 1112.06);
  if (iErr) throw iErr;
  if (!inbox || inbox.length !== 1) throw new Error(`expected the $1,112.06 inbox payment, found ${inbox?.length}`);
  const t = inbox[0];
  console.log(`4. post inbox ${t.date} $${t.amount} as card_payoff 2020 (Dr 2020 / Cr 1000)`);
  if (APPLY) {
    const { data: entryId, error } = await sb.rpc("post_journal_entry", {
      p_entry_date: t.date, p_memo: t.name, p_source: "bank", p_source_id: t.id, p_template: "card_payoff",
      p_location_id: t.location_id, p_created_by: "admin-confirmed",
      p_lines: [{ account_code: "2020", amount: 1112.06, memo: t.name }, { account_code: "1000", amount: -1112.06, memo: t.name }],
    });
    if (error) throw error;
    await sb.from("bank_transactions").update({ status: "posted", journal_entry_id: entryId }).eq("id", t.id);
  }
  console.log(APPLY ? "applied" : "dry run: pass --apply to make these changes");
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e); process.exit(1); });
