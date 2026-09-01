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
import { classify, type CategorizationRule, type MatchableTransaction } from "@/lib/accounting/rules";
import { buildLinesForBankRule } from "@/lib/accounting/posting";
import { loanPayment } from "@/lib/accounting/templates";
import { findNearestUnpaidRow } from "@/lib/accounting/loan-schedule";
import { postSquareRevenueForDay, postStripeRevenueForDay, SQUARE_LOCATION_MAP } from "@/lib/accounting/revenue-job";
import { postDepreciationForMonth } from "@/lib/accounting/depreciation-job";
import { todayInDenver } from "@/lib/timezone";

function yesterdayInDenver(): string {
  const { y, m, d } = todayInDenver();
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

type BankAccountRow = { id: string; plaid_account_id: string; ledger_account_id: string; default_location_id: string | null };

function toMatchable(row: { bank_account_id: string; name: string | null; merchant_name: string | null; amount: number }): MatchableTransaction {
  return { bankAccountId: row.bank_account_id, name: row.name, merchantName: row.merchant_name, amount: row.amount };
}

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

async function classifyUnreviewed(sb: ReturnType<typeof getSupabase>) {
  const { data: rulesRaw, error: rulesErr } = await sb
    .from("categorization_rules")
    .select("*, accounts(code)")
    .eq("active", true);
  if (rulesErr) { console.error("PLAID_SYNC_RULES_FETCH_ERROR", rulesErr); return { classified: 0 }; }

  const rules: (CategorizationRule & { targetAccountCode: string | null; hitCount: number })[] = (rulesRaw ?? []).map((r) => ({
    id: r.id,
    priority: r.priority,
    matchField: r.match_field,
    matchRegex: r.match_regex,
    bankAccountId: r.bank_account_id,
    amountMin: r.amount_min,
    amountMax: r.amount_max,
    direction: r.direction,
    template: r.template,
    targetAccountId: r.target_account_id,
    loanId: r.loan_id,
    locationId: r.location_id,
    active: r.active,
    targetAccountCode: r.accounts?.code ?? null,
    hitCount: r.hit_count ?? 0,
  }));

  const { data: pending, error: txnErr } = await sb
    .from("bank_transactions")
    .select("id, bank_account_id, date, name, merchant_name, amount, pending, status, bank_accounts(accounts(code))")
    .eq("status", "unreviewed")
    .eq("pending", false);
  if (txnErr) { console.error("PLAID_SYNC_TXN_FETCH_ERROR", txnErr); return { classified: 0, posted: 0 }; }

  let classified = 0;
  let posted = 0;
  for (const txn of pending ?? []) {
    const matchable = toMatchable(txn);
    const outcome = classify(matchable, rules);

    if (outcome.action === "review") continue;

    if (outcome.action === "ignore") {
      await sb.from("bank_transactions").update({ status: "ignored", rule_id: outcome.rule.id }).eq("id", txn.id);
      classified++;
      continue;
    }
    if (outcome.action === "flag") {
      await sb.from("bank_transactions").update({ rule_id: outcome.rule.id }).eq("id", txn.id);
      classified++;
      continue;
    }

    // action === "post" — re-fetch the full (extended) rule by id, since
    // classify()'s return type only carries the base CategorizationRule shape.
    const rule = rules.find((r) => r.id === outcome.rule.id);
    if (!rule) continue;

    const srcAccountCode = (txn.bank_accounts as unknown as { accounts: { code: string } | null } | null)?.accounts?.code;
    if (!srcAccountCode) continue;

    let lines: { accountCode: string; amount: number; memo?: string }[];
    let scheduleRowId: string | null = null;

    if (rule.template === "loan_payment") {
      if (!rule.loanId || !rule.targetAccountCode) {
        console.error("PLAID_SYNC_POST_UNSUPPORTED", rule.id, "loan_payment rule needs loan_id and target_account_id");
        continue;
      }
      const { data: scheduleRows, error: scheduleErr } = await sb
        .from("loan_schedule")
        .select("id, due_date, principal, interest, status")
        .eq("loan_id", rule.loanId)
        .eq("status", "scheduled");
      if (scheduleErr) { console.error("PLAID_SYNC_LOAN_SCHEDULE_FETCH_ERROR", scheduleErr); continue; }

      const match = findNearestUnpaidRow(
        (scheduleRows ?? []).map((r) => ({ ...r, dueDate: r.due_date })),
        txn.date
      );
      if (!match) {
        console.error("PLAID_SYNC_LOAN_NO_SCHEDULE_MATCH", rule.loanId, txn.id, txn.date);
        continue;
      }

      lines = loanPayment({
        srcAccountCode,
        loanAccountCode: rule.targetAccountCode,
        principal: match.principal,
        interest: match.interest,
        memo: txn.name ?? undefined,
      });
      scheduleRowId = match.id;
    } else {
      const result = buildLinesForBankRule(rule, matchable, { srcAccountCode, targetAccountCode: rule.targetAccountCode }, txn.name ?? undefined);
      if (!result.ok) {
        console.error("PLAID_SYNC_POST_UNSUPPORTED", rule.id, result.reason);
        continue;
      }
      lines = result.lines;
    }

    const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
      p_entry_date: txn.date,
      p_memo: txn.name ?? null,
      p_source: "bank",
      p_source_id: txn.id,
      p_template: rule.template,
      p_location_id: rule.locationId,
      p_created_by: "rules-engine",
      p_lines: lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
    });
    if (postErr) {
      console.error("PLAID_SYNC_POST_ERROR", rule.id, txn.id, postErr.message);
      continue;
    }

    if (scheduleRowId) {
      await sb.from("loan_schedule").update({ status: "paid", bank_transaction_id: txn.id }).eq("id", scheduleRowId);
    }

    await sb.from("bank_transactions").update({ status: "posted", rule_id: rule.id, journal_entry_id: entryId }).eq("id", txn.id);
    await sb.from("categorization_rules").update({ hit_count: rule.hitCount + 1 }).eq("id", rule.id);
    posted++;
    classified++;
  }
  return { classified, posted };
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
