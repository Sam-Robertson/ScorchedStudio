// One-time: run this AFTER re-linking an institution (Chase / Amex / U.S.
// Bank) via Plaid Link with the days_requested:730 fix (lib/plaid.ts), and
// AFTER mapping each new Plaid account to its ledger account in the
// Bank Accounts tab the normal way (POST /api/admin/accounting/bank-accounts).
//
// Why this exists: re-linking creates a brand-new Plaid item that reports
// full history, but the old item is still the one attached to
// bank_transactions/journal_entries for 2026-06-03 onward. Blindly syncing
// the new item would re-pull and re-post every transaction in that window
// under new plaid_transaction_ids, doubling revenue and expenses for the
// last three months. This script only imports what the new item has that
// the old one doesn't: everything strictly BEFORE the old account's
// earliest synced date. It then flips the old bank_account to inactive and
// the new one to active, so the daily cron takes over from the new item
// going forward and nothing double-syncs.
//
// Usage: node --experimental-strip-types scripts/import_historical_plaid_data.ts <new_plaid_item_id>
// Run once per re-linked institution. Leaves everything it imports as
// status='unreviewed' — the next daily cron run (or a manual trigger of
// /api/cron/plaid-sync) applies the existing categorization rules to it,
// exactly like any other sync. Nothing here posts a journal entry directly.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
for (const k in env) process.env[k] = env[k];

const NEW_ITEM_ID = process.argv[2];
if (!NEW_ITEM_ID) {
  console.error("Usage: node import_historical_plaid_data.ts <new_plaid_item_id>");
  process.exit(1);
}

async function main() {
  const { getDecryptedAccessToken, syncTransactions } = await import("../lib/plaid.ts");
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: newItem, error: itemErr } = await sb
    .from("plaid_items")
    .select("id, institution_name")
    .eq("item_id", NEW_ITEM_ID)
    .single();
  if (itemErr || !newItem) throw new Error(`Plaid item ${NEW_ITEM_ID} not found — did the exchange step run?`);

  const { data: newBankAccounts, error: baErr } = await sb
    .from("bank_accounts")
    .select("id, plaid_account_id, ledger_account_id, name, active, accounts(code, name)")
    .eq("plaid_item_id", newItem.id);
  if (baErr) throw baErr;
  if (!newBankAccounts?.length) {
    throw new Error(`No bank_accounts mapped for item ${NEW_ITEM_ID} yet — map each Plaid account to a ledger account in Bank Accounts first.`);
  }

  for (const newBa of newBankAccounts) {
    const ledgerName = (newBa.accounts as unknown as { code: string; name: string } | null);
    console.log(`\n--- ${newBa.name} -> ${ledgerName?.code} ${ledgerName?.name} ---`);

    // Find the OLD bank_account already mapped to this same ledger account
    // (a different plaid_item_id, currently active) — that's the account
    // whose earliest date defines our import cutoff.
    const { data: oldBas, error: oldErr } = await sb
      .from("bank_accounts")
      .select("id, plaid_item_id")
      .eq("ledger_account_id", newBa.ledger_account_id)
      .eq("active", true)
      .neq("id", newBa.id);
    if (oldErr) throw oldErr;
    if (!oldBas?.length) {
      console.log("  No existing active mapping for this ledger account — nothing to avoid duplicating. Skipping cutoff logic; review manually before enabling.");
      continue;
    }
    const oldBankAccountId = oldBas[0].id;

    const { data: earliestRow } = await sb
      .from("bank_transactions")
      .select("date")
      .eq("bank_account_id", oldBankAccountId)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const cutoffDate = earliestRow?.date;
    if (!cutoffDate) {
      console.log("  Old account has no transactions yet — nothing to avoid duplicating. Skipping cutoff logic; review manually before enabling.");
      continue;
    }
    console.log(`  Cutoff date (old account's earliest): ${cutoffDate}. Importing only dates before this.`);

    // Pull the new item's full transaction history via /transactions/sync.
    const accessToken = await getDecryptedAccessToken(newItem.id);
    let cursor: string | null = null;
    let imported = 0, skippedOnOrAfterCutoff = 0;
    for (;;) {
      const page = await syncTransactions(accessToken, cursor);
      for (const t of page.added) {
        if (t.account_id !== newBa.plaid_account_id) continue;
        if (t.date >= cutoffDate) { skippedOnOrAfterCutoff++; continue; }
        const { error: upsertErr } = await sb.from("bank_transactions").upsert(
          {
            bank_account_id: newBa.id,
            plaid_transaction_id: t.transaction_id,
            date: t.date,
            amount: t.amount,
            name: t.name,
            merchant_name: t.merchant_name,
            plaid_category: t.category,
            pending: t.pending,
            raw: t,
            location_id: null,
          },
          { onConflict: "plaid_transaction_id", ignoreDuplicates: false }
        );
        if (upsertErr) { console.error("  UPSERT_ERROR", t.transaction_id, upsertErr.message); continue; }
        imported++;
      }
      cursor = page.next_cursor;
      if (!page.has_more) break;
    }
    console.log(`  Imported ${imported} pre-cutoff transactions, skipped ${skippedOnOrAfterCutoff} already covered by the old account.`);
    console.log(`  NOT flipping active flags automatically — do that manually once you've spot-checked the import:`);
    console.log(`    update bank_accounts set active=false where id='${oldBankAccountId}';`);
    console.log(`    update bank_accounts set active=true  where id='${newBa.id}';`);
  }

  console.log("\nDone. Run the daily cron (or wait for it) to categorize the newly imported rows.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
