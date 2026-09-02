// One-time: adds a Meals & Entertainment account (the chart had no home for
// meals, which matters for taxes — meals are only 50% deductible per
// Schedule C Line 24b, unlike a generic "other expense") and categorizes
// the 6 renovation-period restaurant purchases the user confirmed. The 7th
// candidate transaction (Harmons - Orem Fuel) turned out to be a gas
// station purchase, not food — routed to Vehicle (6950) instead.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { expense } from "../lib/accounting/templates.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MEALS: { id: string; date: string; amount: number; srcAccountCode: string; memo: string }[] = [
  { id: "3551fc0f-87c3-4eab-8629-26d12727042e", date: "2025-06-20", amount: 86.69, srcAccountCode: "2000", memo: "Domino's" },
  { id: "34e48bc3-c1aa-4366-8750-64ea9622e2d4", date: "2025-06-26", amount: 43.34, srcAccountCode: "2010", memo: "Five Guys" },
  { id: "0f9fd37b-a635-43d6-b005-e91db907fc06", date: "2025-06-28", amount: 28.61, srcAccountCode: "2010", memo: "Burgers Supreme" },
  { id: "2edad866-6db8-4726-93da-ae6aa3bf28f6", date: "2025-07-06", amount: 78.29, srcAccountCode: "2010", memo: "Via 313" },
  { id: "deb4a032-5a99-4a34-9043-5340fec2a847", date: "2025-07-13", amount: 38.21, srcAccountCode: "2010", memo: "Holy Taco" },
  { id: "aea0fc45-d0dc-45b3-b0c3-dc4e514c498b", date: "2025-07-16", amount: 19.29, srcAccountCode: "2010", memo: "Via 313" },
];

const FUEL = { id: "da94a66f-5c6c-4242-8baf-586a747412e8", date: "2025-06-26", amount: 11.87, srcAccountCode: "2010", memo: "Harmons - Orem Fuel" };

async function postExpense(bankTxnId: string, targetCode: string, amount: number, srcAccountCode: string, date: string, memo: string) {
  const { data: existing } = await sb.from("bank_transactions").select("status").eq("id", bankTxnId).single();
  if (existing?.status === "posted") { console.log(`${memo} already posted — skipping`); return; }

  const lines = expense({ amount, srcAccountCode, expenseAccountCode: targetCode, memo });
  const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
    p_entry_date: date,
    p_memo: memo,
    p_source: "bank",
    p_source_id: bankTxnId,
    p_template: "expense",
    p_location_id: null,
    p_created_by: "manual-confirmed",
    p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
  });
  if (postErr) throw new Error(`post failed for ${memo}: ${postErr.message}`);

  const { error: updateErr } = await sb.from("bank_transactions").update({ status: "posted", journal_entry_id: entryId }).eq("id", bankTxnId);
  if (updateErr) throw updateErr;
  console.log(`posted ${memo} ($${amount}) -> ${targetCode}, journal_entry ${entryId}`);
}

async function main() {
  const { data: existingAccount } = await sb.from("accounts").select("id").eq("code", "6850").maybeSingle();
  if (!existingAccount) {
    const { error: acctErr } = await sb.from("accounts").insert({
      code: "6850", name: "Meals & Entertainment", type: "expense", is_cash: false, is_contra: false,
    });
    if (acctErr) throw acctErr;
    console.log("added account 6850 Meals & Entertainment");

    const { error: taxErr } = await sb.from("tax_line_mapping").upsert(
      { account_code: "6850", tax_line: "Meals (Line 24b) — 50% deductible" },
      { onConflict: "account_code" }
    );
    if (taxErr) throw taxErr;
    console.log("mapped 6850 for tax export");
  } else {
    console.log("account 6850 already exists");
  }

  for (const m of MEALS) {
    await postExpense(m.id, "6850", m.amount, m.srcAccountCode, m.date, m.memo);
  }
  await postExpense(FUEL.id, "6950", FUEL.amount, FUEL.srcAccountCode, FUEL.date, FUEL.memo);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
