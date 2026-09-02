// One-time: run this AFTER re-linking an institution (Chase / Amex / U.S.
// Bank) via Plaid Link with the days_requested:730 fix (lib/plaid.ts), and
// AFTER mapping each new Plaid account to its ledger account in the
// Bank Accounts tab the normal way.
//
// Why this exists: re-linking creates a brand-new Plaid item that reports
// full history, but the old item is still the one attached to
// bank_transactions/journal_entries for the already-synced window.
// Blindly syncing the new item would re-pull and re-post every transaction
// in that window under new plaid_transaction_ids, doubling revenue and
// expenses. This script:
//   1. Walks the new item's FULL transaction history via /transactions/sync
//      (cursor starts null, paginates to has_more=false).
//   2. Imports only rows dated strictly BEFORE the old account's earliest
//      synced date — the real gap Plaid is now filling.
//   3. Stores the final cursor from that walk as the new item's
//      sync_cursor, so the next daily cron run resumes from "now forward"
//      instead of re-walking full history and re-hitting the overlap
//      window all over again (the bug in the first draft of this script:
//      it inserted the historical gap correctly but left sync_cursor null,
//      which would have made the very next cron run duplicate the
//      already-covered months right back into existence).
// It does NOT flip any bank_accounts.active flags — that's a separate,
// deliberate step once the import here has been spot-checked.
//
// Usage: node --experimental-strip-types scripts/import_historical_plaid_data.ts <new_plaid_item_id>
//
// Reimplements the handful of lib/plaid.ts calls it needs inline rather
// than importing that module directly: lib/plaid.ts pulls in "@/..."
// path-aliased imports that only Next.js's bundler resolves, not plain
// `node --experimental-strip-types` (same class of issue already hit and
// fixed in scripts/backfill_square_sales_summary.ts).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { decryptToken, fromPgBytea } from "../lib/accounting/encryption.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
for (const k in env) process.env[k] = env[k];

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function plaidBaseUrl() {
  return env.PLAID_ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
}

async function plaidFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PLAID_API_ERROR ${res.status} ${json.error_code ?? ""}: ${json.error_message ?? JSON.stringify(json)}`);
  return json as T;
}

type PlaidTransaction = {
  transaction_id: string; account_id: string; date: string; amount: number;
  name: string; merchant_name: string | null; category: string[] | null; pending: boolean;
};
type SyncPage = { added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean };

async function syncTransactions(accessToken: string, cursor: string | null): Promise<SyncPage> {
  return plaidFetch<SyncPage>("/transactions/sync", { access_token: accessToken, cursor: cursor ?? undefined, count: 500 });
}

async function getDecryptedAccessToken(plaidItemId: string): Promise<string> {
  const { data, error } = await sb.from("plaid_items").select("access_token_enc").eq("id", plaidItemId).single();
  if (error || !data) throw new Error(`Unknown plaid_item ${plaidItemId}`);
  return decryptToken(fromPgBytea(data.access_token_enc));
}

const NEW_ITEM_ID = process.argv[2];
if (!NEW_ITEM_ID) {
  console.error("Usage: node import_historical_plaid_data.ts <new_plaid_item_id>");
  process.exit(1);
}

async function main() {
  const { data: newItem, error: itemErr } = await sb
    .from("plaid_items")
    .select("id, institution_name")
    .eq("item_id", NEW_ITEM_ID)
    .single();
  if (itemErr || !newItem) throw new Error(`Plaid item ${NEW_ITEM_ID} not found — did the exchange step run?`);

  const { data: newBankAccounts, error: baErr } = await sb
    .from("bank_accounts")
    .select("id, plaid_account_id, ledger_account_id, name, accounts(code, name)")
    .eq("plaid_item_id", newItem.id);
  if (baErr) throw baErr;
  if (!newBankAccounts?.length) {
    throw new Error(`No bank_accounts mapped for item ${NEW_ITEM_ID} yet — map each Plaid account to a ledger account in Bank Accounts first.`);
  }

  // Cutoff per Plaid account: the earliest date already synced by the OLD,
  // still-active mapping for the same ledger account.
  const cutoffByPlaidAccountId = new Map<string, string>();
  const oldBankAccountByPlaidAccountId = new Map<string, string>();
  for (const newBa of newBankAccounts) {
    const { data: oldBas } = await sb
      .from("bank_accounts")
      .select("id")
      .eq("ledger_account_id", newBa.ledger_account_id)
      .eq("active", true)
      .neq("id", newBa.id);
    if (!oldBas?.length) continue;
    const { data: earliestRow } = await sb
      .from("bank_transactions")
      .select("date")
      .eq("bank_account_id", oldBas[0].id)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (earliestRow?.date) {
      cutoffByPlaidAccountId.set(newBa.plaid_account_id, earliestRow.date);
      oldBankAccountByPlaidAccountId.set(newBa.plaid_account_id, oldBas[0].id);
    }
  }

  const baByPlaidId = new Map(newBankAccounts.map((b) => [b.plaid_account_id, b]));
  const accessToken = await getDecryptedAccessToken(newItem.id);

  let cursor: string | null = null;
  let imported = 0, skippedOnOrAfterCutoff = 0, skippedNoCutoff = 0;
  for (;;) {
    const page = await syncTransactions(accessToken, cursor);
    for (const t of page.added) {
      const ba = baByPlaidId.get(t.account_id);
      if (!ba) continue; // an account on this item we haven't mapped (shouldn't happen, but don't guess)
      const cutoffDate = cutoffByPlaidAccountId.get(t.account_id);
      if (!cutoffDate) { skippedNoCutoff++; continue; } // no old mapping to protect — leave for manual review
      if (t.date >= cutoffDate) { skippedOnOrAfterCutoff++; continue; }
      const { error: upsertErr } = await sb.from("bank_transactions").upsert(
        {
          bank_account_id: ba.id,
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
      if (upsertErr) { console.error("UPSERT_ERROR", t.transaction_id, upsertErr.message); continue; }
      imported++;
    }
    cursor = page.next_cursor;
    if (!page.has_more) break;
  }

  // Advance this item's sync_cursor to "now" so the next daily cron run
  // picks up only new activity, not a second full walk of history.
  const { error: cursorErr } = await sb
    .from("plaid_items")
    .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString() })
    .eq("id", newItem.id);
  if (cursorErr) throw cursorErr;

  console.log(`${newItem.institution_name} (${NEW_ITEM_ID}):`);
  console.log(`  imported ${imported} pre-cutoff transactions`);
  console.log(`  skipped ${skippedOnOrAfterCutoff} already covered by the old account`);
  if (skippedNoCutoff > 0) console.log(`  skipped ${skippedNoCutoff} with no old mapping found — review manually`);
  console.log(`  sync_cursor advanced to "now" — next cron run picks up new activity only`);
  console.log(`\n  Cutoffs used:`);
  for (const [plaidAccountId, cutoff] of cutoffByPlaidAccountId) {
    const ba = baByPlaidId.get(plaidAccountId);
    const oldId = oldBankAccountByPlaidAccountId.get(plaidAccountId);
    console.log(`    ${ba?.name} -> cutoff ${cutoff} (old bank_account ${oldId})`);
  }
  console.log(`\n  Once spot-checked, flip which mapping is live for each ledger account:`);
  for (const [plaidAccountId, oldId] of oldBankAccountByPlaidAccountId) {
    const ba = baByPlaidId.get(plaidAccountId);
    console.log(`    update bank_accounts set active=false where id='${oldId}';`);
    console.log(`    update bank_accounts set active=true  where id='${ba?.id}';`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
