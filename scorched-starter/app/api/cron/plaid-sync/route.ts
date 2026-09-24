// app/api/cron/plaid-sync/route.ts
// Called daily by Vercel Cron (see vercel.json — the spec calls for hourly,
// but this project is on Vercel's Hobby plan, which only allows daily cron
// invocations; revisit if the plan changes). For each linked Plaid
// item: pulls new/changed transactions via /transactions/sync, upserts
// bank_transactions, and runs the categorization rules engine on anything
// newly posted (non-pending) and unreviewed.
//
// Also posts Square and Stripe revenue settlements for yesterday and any
// recent day that has not posted yet (see
// lib/accounting/revenue-job.ts) in the same invocation, rather than
// registering more Vercel Cron entries — Hobby plans cap the cron count,
// and this project already uses both of its slots (this one + daily-report).
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getDecryptedAccessToken, PlaidApiError, syncTransactions, type PlaidTransaction } from "@/lib/plaid";
import { classifyUnreviewed } from "@/lib/accounting/classify-job";
import { postSquareRevenueForDay, postStripeRevenueForDay, SQUARE_LOCATION_MAP } from "@/lib/accounting/revenue-job";
import { postDepreciationForMonth } from "@/lib/accounting/depreciation-job";
import { postSquarePayoutWithholdings } from "@/lib/accounting/payout-job";
import { notifyBankNeedsLogin } from "@/lib/bank-connection-notify";
import { todayInDenver, yesterdayInDenverYmd } from "@/lib/timezone";

// Vercel's Hobby-plan ceiling for one function run.
export const maxDuration = 60;

// Revenue catch-up: how far back to look for days that never posted, and
// when to stop starting new ones. The budget is checked before each day, and
// one day (Square plus Stripe) can take several seconds, so it sits far under
// maxDuration. A run cut off between a day's journal entry and its settlement
// record would leave the next run unaware and posting that day twice.
const REVENUE_LOOKBACK_DAYS = 14;
const REVENUE_TIME_BUDGET_MS = 25_000;
// Square payouts: how far back to look for paid payouts whose Square Capital
// repayment / payout fees have not been posted yet (payout-job.ts). Payouts
// usually pay out within a day or two; a month covers any run that was down.
const PAYOUT_LOOKBACK_DAYS = 30;

// "2026-09-14", 2 -> "2026-09-12". Pure calendar arithmetic on the date.
function daysBefore(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

type BankAccountRow = { id: string; plaid_account_id: string; ledger_account_id: string; default_location_id: string | null };

async function syncOneItem(
  sb: ReturnType<typeof getSupabase>,
  item: { id: string; item_id: string; sync_cursor: string | null },
  bankAccountsByPlaidId: Map<string, BankAccountRow>
) {
  const accessToken = await getDecryptedAccessToken(item.id);
  let cursor = item.sync_cursor;
  let added = 0, modified = 0, removed = 0, skippedUnmapped = 0;

  for (;;) {
    const page = await syncTransactions(accessToken, cursor);

    for (const t of [...page.added, ...page.modified] as PlaidTransaction[]) {
      const bankAccount = bankAccountsByPlaidId.get(t.account_id);
      if (!bankAccount) { skippedUnmapped++; continue; }

      const { error } = await sb.from("bank_transactions").upsert(
        {
          bank_account_id: bankAccount.id,
          plaid_transaction_id: t.transaction_id,
          date: t.date,
          amount: t.amount,
          name: t.name,
          merchant_name: t.merchant_name,
          plaid_category: t.category,
          pending: t.pending,
          raw: t,
          location_id: bankAccount.default_location_id,
        },
        { onConflict: "plaid_transaction_id", ignoreDuplicates: false }
      );
      if (error) { console.error("PLAID_SYNC_UPSERT_ERROR", error); continue; }
      if (page.added.includes(t)) added++; else modified++;
    }

    for (const r of page.removed) {
      const { data: existing } = await sb
        .from("bank_transactions")
        .select("id, journal_entry_id")
        .eq("plaid_transaction_id", r.transaction_id)
        .maybeSingle();
      if (!existing) continue;
      // Drop the pointer before deleting the entry: bank_transactions.journal_entry_id
      // is a plain foreign key, so deleting the entry first fails and leaves the
      // entry (and its expense) in the ledger while the transaction is marked
      // ignored. A pending Amazon charge categorised by hand, then replaced by
      // Plaid with its posted twin, was double-counted this way in September 2026.
      await sb.from("bank_transactions").update({ status: "ignored", journal_entry_id: null }).eq("id", existing.id);
      if (existing.journal_entry_id) {
        const { error: delErr } = await sb.from("journal_entries").delete().eq("id", existing.journal_entry_id);
        if (delErr) console.error("PLAID_SYNC_REVERSE_ENTRY_ERROR", delErr.message);
      }
      removed++;
    }

    cursor = page.next_cursor;
    await sb.from("plaid_items").update({ sync_cursor: cursor, last_synced_at: new Date().toISOString() }).eq("id", item.id);
    if (!page.has_more) break;
  }

  return { added, modified, removed, skippedUnmapped };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();

  try {
    const sb = getSupabase();

    const { data: items, error: itemsErr } = await sb
      .from("plaid_items")
      .select("id, item_id, institution_name, sync_cursor")
      .eq("status", "ok");
    if (itemsErr) throw new Error(itemsErr.message);

    const { data: bankAccounts, error: baErr } = await sb
      .from("bank_accounts")
      .select("id, plaid_account_id, ledger_account_id, default_location_id, plaid_item_id")
      .eq("active", true);
    if (baErr) throw new Error(baErr.message);

    const results: Record<string, unknown> = {};
    for (const item of items ?? []) {
      const byPlaidId = new Map((bankAccounts ?? []).filter((b) => b.plaid_item_id === item.id).map((b) => [b.plaid_account_id, b]));
      // Each bank syncs on its own: one failing must not stop the others or
      // the revenue posting below. A lapsed Chase login once stalled every
      // bank feed and all revenue for eleven days (September 2026).
      try {
        results[item.item_id] = await syncOneItem(sb, item, byPlaidId);
      } catch (err) {
        if (err instanceof PlaidApiError && err.code === "ITEM_LOGIN_REQUIRED") {
          // Skipped from now on (only status "ok" items sync) until someone
          // reconnects it from the Bank Accounts tab.
          const { error: statusErr } = await sb.from("plaid_items").update({ status: "login_required" }).eq("id", item.id);
          if (statusErr) console.error("PLAID_SYNC_STATUS_UPDATE_ERROR", item.item_id, statusErr.message);
          await notifyBankNeedsLogin(item.institution_name);
          results[item.item_id] = { status: "login_required" };
        } else {
          console.error("PLAID_SYNC_ITEM_ERROR", item.item_id, err);
          results[item.item_id] = { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const classifyResult = await classifyUnreviewed(sb);

    // Yesterday and every recent day that has not posted yet, newest first,
    // so days missed while this job was failing fill themselves in. Days
    // already posted are a cheap skip (revenue-job.ts).
    const yesterday = yesterdayInDenverYmd();
    const revenueResults: Record<string, unknown> = {};
    for (let back = 0; back < REVENUE_LOOKBACK_DAYS; back++) {
      const date = daysBefore(yesterday, back);
      if (Date.now() - startedAt > REVENUE_TIME_BUDGET_MS) {
        revenueResults.stoppedEarly = `time budget reached at ${date}; older days post on a later run`;
        break;
      }
      for (const [squareLocationId, locationKey] of Object.entries(SQUARE_LOCATION_MAP)) {
        const key = `square:${locationKey}:${date}`;
        try {
          revenueResults[key] = await postSquareRevenueForDay(squareLocationId, locationKey, date);
        } catch (err) {
          console.error("SQUARE_REVENUE_CRON_ERROR", key, err);
          revenueResults[key] = { status: "error", message: err instanceof Error ? err.message : String(err) };
        }
      }
      try {
        revenueResults[`stripe:${date}`] = await postStripeRevenueForDay(date);
      } catch (err) {
        console.error("STRIPE_REVENUE_CRON_ERROR", date, err);
        revenueResults[`stripe:${date}`] = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    }

    // What Square kept back from each payout (Square Capital repayments and
    // payout-level fees) never appears in the daily settlement above, so the
    // clearing account would drift from the bank without this step.
    const payoutResults: Record<string, unknown> = {};
    for (const [squareLocationId, locationKey] of Object.entries(SQUARE_LOCATION_MAP)) {
      try {
        payoutResults[locationKey] = await postSquarePayoutWithholdings(squareLocationId, daysBefore(yesterday, PAYOUT_LOOKBACK_DAYS), yesterday);
      } catch (err) {
        console.error("SQUARE_PAYOUT_CRON_ERROR", locationKey, err);
        payoutResults[locationKey] = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    }

    const { y: depYear, m: depMonth } = todayInDenver();
    let depreciationResult: unknown;
    try {
      depreciationResult = await postDepreciationForMonth(depYear, depMonth);
    } catch (err) {
      console.error("DEPRECIATION_CRON_ERROR", err);
      depreciationResult = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    return Response.json({
      synced: results,
      ...classifyResult,
      revenue: { through: yesterday, results: revenueResults },
      payouts: payoutResults,
      depreciation: depreciationResult,
    });
  } catch (err) {
    console.error("PLAID_SYNC_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
