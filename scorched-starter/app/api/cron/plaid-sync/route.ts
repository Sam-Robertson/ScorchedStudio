// app/api/cron/plaid-sync/route.ts
// Called daily by Vercel Cron (see vercel.json — the spec calls for hourly,
// but this project is on Vercel's Hobby plan, which only allows daily cron
// invocations; revisit if the plan changes). For each linked Plaid
// item: pulls new/changed transactions via /transactions/sync, upserts
// bank_transactions, and runs the categorization rules engine on anything
// newly posted (non-pending) and unreviewed.
//
// Also posts yesterday's Square and Stripe revenue settlements (see
// lib/accounting/revenue-job.ts) in the same invocation, rather than
// registering more Vercel Cron entries — Hobby plans cap the cron count,
// and this project already uses both of its slots (this one + daily-report).
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getDecryptedAccessToken, syncTransactions, type PlaidTransaction } from "@/lib/plaid";
import { classifyUnreviewed } from "@/lib/accounting/classify-job";
import { postSquareRevenueForDay, postStripeRevenueForDay, SQUARE_LOCATION_MAP } from "@/lib/accounting/revenue-job";
import { postDepreciationForMonth } from "@/lib/accounting/depreciation-job";
import { todayInDenver } from "@/lib/timezone";

function yesterdayInDenver(): string {
  const { y, m, d } = todayInDenver();
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
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
      if (existing.journal_entry_id) {
        const { error: delErr } = await sb.from("journal_entries").delete().eq("id", existing.journal_entry_id);
        if (delErr) console.error("PLAID_SYNC_REVERSE_ENTRY_ERROR", delErr.message);
      }
      await sb.from("bank_transactions").update({ status: "ignored" }).eq("id", existing.id);
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

  try {
    const sb = getSupabase();

    const { data: items, error: itemsErr } = await sb.from("plaid_items").select("id, item_id, sync_cursor").eq("status", "ok");
    if (itemsErr) throw new Error(itemsErr.message);

    const { data: bankAccounts, error: baErr } = await sb
      .from("bank_accounts")
      .select("id, plaid_account_id, ledger_account_id, default_location_id, plaid_item_id")
      .eq("active", true);
    if (baErr) throw new Error(baErr.message);

    const results: Record<string, unknown> = {};
    for (const item of items ?? []) {
      const byPlaidId = new Map((bankAccounts ?? []).filter((b) => b.plaid_item_id === item.id).map((b) => [b.plaid_account_id, b]));
      results[item.item_id] = await syncOneItem(sb, item, byPlaidId);
    }

    const classifyResult = await classifyUnreviewed(sb);

    const revenueDate = yesterdayInDenver();
    const revenueResults: Record<string, unknown> = {};
    for (const [squareLocationId, locationKey] of Object.entries(SQUARE_LOCATION_MAP)) {
      try {
        revenueResults[`square:${locationKey}`] = await postSquareRevenueForDay(squareLocationId, locationKey, revenueDate);
      } catch (err) {
        console.error("SQUARE_REVENUE_CRON_ERROR", locationKey, err);
        revenueResults[`square:${locationKey}`] = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    }
    try {
      revenueResults.stripe = await postStripeRevenueForDay(revenueDate);
    } catch (err) {
      console.error("STRIPE_REVENUE_CRON_ERROR", err);
      revenueResults.stripe = { status: "error", message: err instanceof Error ? err.message : String(err) };
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
      revenue: { date: revenueDate, results: revenueResults },
      depreciation: depreciationResult,
    });
  } catch (err) {
    console.error("PLAID_SYNC_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
