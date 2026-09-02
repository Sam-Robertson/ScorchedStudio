// lib/accounting/classify-job.ts — server-only
//
// The categorization sweep: applies active rules to every unreviewed,
// non-pending bank transaction. Originally lived only inside the daily
// cron (app/api/cron/plaid-sync/route.ts) — extracted here so the Inbox's
// "categorize + create a rule" flow can run the same sweep immediately
// after saving, instead of a new rule only taking effect on tomorrow's
// cron run. Both call sites must stay behind admin/cron auth; this module
// has no auth of its own.
import { getSupabase } from "@/lib/supabase";
import { classify, type CategorizationRule, type MatchableTransaction } from "@/lib/accounting/rules";
import { buildLinesForBankRule } from "@/lib/accounting/posting";
import { loanPayment } from "@/lib/accounting/templates";
import { findNearestUnpaidRow } from "@/lib/accounting/loan-schedule";

function toMatchable(row: { bank_account_id: string; name: string | null; merchant_name: string | null; amount: number }): MatchableTransaction {
  return { bankAccountId: row.bank_account_id, name: row.name, merchantName: row.merchant_name, amount: row.amount };
}

export async function classifyUnreviewed(sb: ReturnType<typeof getSupabase>) {
  const { data: rulesRaw, error: rulesErr } = await sb
    .from("categorization_rules")
    .select("*, accounts(code)")
    .eq("active", true);
  if (rulesErr) { console.error("CLASSIFY_RULES_FETCH_ERROR", rulesErr); return { classified: 0, posted: 0 }; }

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
  if (txnErr) { console.error("CLASSIFY_TXN_FETCH_ERROR", txnErr); return { classified: 0, posted: 0 }; }

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
        console.error("CLASSIFY_POST_UNSUPPORTED", rule.id, "loan_payment rule needs loan_id and target_account_id");
        continue;
      }
      const { data: scheduleRows, error: scheduleErr } = await sb
        .from("loan_schedule")
        .select("id, due_date, principal, interest, status")
        .eq("loan_id", rule.loanId)
        .eq("status", "scheduled");
      if (scheduleErr) { console.error("CLASSIFY_LOAN_SCHEDULE_FETCH_ERROR", scheduleErr); continue; }

      const match = findNearestUnpaidRow(
        (scheduleRows ?? []).map((r) => ({ ...r, dueDate: r.due_date })),
        txn.date
      );
      if (!match) {
        console.error("CLASSIFY_LOAN_NO_SCHEDULE_MATCH", rule.loanId, txn.id, txn.date);
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
        console.error("CLASSIFY_POST_UNSUPPORTED", rule.id, result.reason);
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
      console.error("CLASSIFY_POST_ERROR", rule.id, txn.id, postErr.message);
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
