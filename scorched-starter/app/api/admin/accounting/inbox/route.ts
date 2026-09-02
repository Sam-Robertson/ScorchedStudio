// app/api/admin/accounting/inbox/route.ts
// GET lists unreviewed bank transactions (the safety net — nothing posts to
// the P&L without a rule or a human, build spec §6). POST categorizes one:
// posts a journal entry via the same template engine the rules cron uses,
// and optionally creates a categorization rule from the override so the
// same merchant auto-posts next time. After every POST, also runs the same
// categorization sweep the daily cron runs — otherwise a newly created (or
// already-existing but never-applied) rule only affects other matching
// inbox items on tomorrow's cron run instead of immediately.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { buildLinesForBankRule } from "@/lib/accounting/posting";
import { classifyUnreviewed } from "@/lib/accounting/classify-job";
import type { CategorizationRule } from "@/lib/accounting/rules";
import { buildHistoryIndex, suggestFor } from "@/lib/accounting/suggest";

const CAPEX_SUGGESTION_THRESHOLD = 1000;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("bank_transactions")
      .select("*, bank_accounts(name, mask, accounts(code,name)), locations(key,name), categorization_rules(id,template,match_regex)")
      .eq("status", "unreviewed")
      .order("date", { ascending: false })
      .limit(200);
    if (error) {
      console.error("ACCOUNTING_INBOX_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch inbox" }, { status: 500 });
    }

    // No rule recognized these, so the only free signal left is "have we
    // categorized something that reads like this before" — match against
    // our own posting history (see lib/accounting/suggest.ts) and pre-fill
    // a best guess. Purely advisory: it fills the form, it never posts.
    const { data: history, error: historyErr } = await sb
      .from("bank_transactions")
      .select("name, merchant_name, categorization_rules!inner(template, accounts(code, name, active))")
      .eq("status", "posted")
      .not("rule_id", "is", null)
      .limit(3000);
    if (historyErr) console.error("ACCOUNTING_INBOX_HISTORY_ERROR", historyErr);

    type HistoryRow = {
      name: string | null;
      merchant_name: string | null;
      categorization_rules: { template: string; accounts: { code: string; name: string; active: boolean } | null } | null;
    };
    const historyIndex = buildHistoryIndex(
      ((history ?? []) as unknown as HistoryRow[])
        .filter((h) => h.categorization_rules && (h.categorization_rules.accounts?.active ?? true))
        .map((h) => ({
          name: h.name,
          merchantName: h.merchant_name,
          template: h.categorization_rules!.template,
          targetAccountCode: h.categorization_rules!.accounts?.code ?? null,
          targetAccountName: h.categorization_rules!.accounts?.name ?? null,
        }))
    );

    // §6 priority-90 heuristic: any large debit at a merchant no rule
    // recognized is a candidate fixed-asset purchase worth a second look —
    // this is a UI hint, not an auto-applied template (fixed_assets register
    // creation for `capex` lands in Phase 4).
    const withHints = (data ?? []).map((t) => ({
      ...t,
      suggestCapex: !t.categorization_rules && t.amount >= CAPEX_SUGGESTION_THRESHOLD,
      historySuggestion: t.categorization_rules ? null : suggestFor(t.name, t.merchant_name, historyIndex),
    }));

    return Response.json({ transactions: withHints });
  } catch (err) {
    console.error("ACCOUNTING_INBOX_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const transactionId: unknown = body.transactionId;
    const template: unknown = body.template;
    const targetAccountCode: unknown = body.targetAccountCode ?? null;
    const memo: unknown = body.memo;
    const createRule: unknown = body.createRule; // boolean

    if (typeof transactionId !== "string" || typeof template !== "string") {
      return Response.json({ error: "transactionId and template are required" }, { status: 400 });
    }

    const sb = getSupabase();
    const { data: txn, error: txnErr } = await sb
      .from("bank_transactions")
      .select("*, bank_accounts(accounts(code))")
      .eq("id", transactionId)
      .single();
    if (txnErr || !txn) return Response.json({ error: "Transaction not found" }, { status: 404 });
    if (txn.status !== "unreviewed") return Response.json({ error: `Transaction is already ${txn.status}` }, { status: 400 });

    const srcAccountCode = (txn.bank_accounts as unknown as { accounts: { code: string } | null } | null)?.accounts?.code;
    if (!srcAccountCode) return Response.json({ error: "This transaction's bank account has no ledger mapping" }, { status: 400 });

    if (template === "ignore") {
      await sb.from("bank_transactions").update({ status: "ignored" }).eq("id", transactionId);
      const sweep = await classifyUnreviewed(sb);
      return Response.json({ ok: true, status: "ignored", sweep });
    }

    const matchable = { bankAccountId: txn.bank_account_id, name: txn.name, merchantName: txn.merchant_name, amount: txn.amount };
    const fakeRule: CategorizationRule = {
      id: "manual", priority: 0, matchField: "name", matchRegex: ".*", bankAccountId: null,
      amountMin: null, amountMax: null, direction: null, template,
      targetAccountId: null, loanId: null, locationId: txn.location_id, active: true,
    };

    const result = buildLinesForBankRule(fakeRule, matchable, {
      srcAccountCode,
      targetAccountCode: typeof targetAccountCode === "string" ? targetAccountCode : null,
    }, typeof memo === "string" && memo ? memo : txn.name ?? undefined);

    if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });

    const { data: entryId, error: postErr } = await sb.rpc("post_journal_entry", {
      p_entry_date: txn.date,
      p_memo: typeof memo === "string" && memo ? memo : txn.name,
      p_source: "bank",
      p_source_id: txn.id,
      p_template: template,
      p_location_id: txn.location_id,
      p_created_by: "admin",
      p_lines: result.lines.map((l) => ({ account_code: l.accountCode, amount: l.amount, memo: l.memo ?? null })),
    });
    if (postErr) {
      console.error("ACCOUNTING_INBOX_POST_ERROR", postErr);
      return Response.json({ error: postErr.message }, { status: 400 });
    }

    let ruleId: string | null = null;
    if (createRule && txn.name) {
      let targetAccountId: string | null = null;
      if (typeof targetAccountCode === "string") {
        const { data: acc } = await sb.from("accounts").select("id").eq("code", targetAccountCode).single();
        targetAccountId = acc?.id ?? null;
      }
      const escapedName = txn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const { data: newRule, error: ruleErr } = await sb
        .from("categorization_rules")
        .insert({
          priority: 100,
          match_field: "name",
          match_regex: escapedName,
          template,
          target_account_id: targetAccountId,
          location_id: txn.location_id,
          created_from_override: true,
          hit_count: 1,
        })
        .select("id")
        .single();
      if (ruleErr) console.error("ACCOUNTING_INBOX_CREATE_RULE_ERROR", ruleErr);
      else ruleId = newRule.id;
    }

    await sb.from("bank_transactions").update({ status: "posted", journal_entry_id: entryId, rule_id: ruleId }).eq("id", transactionId);

    // Sweep the rest of the inbox against current rules (including the one
    // just created) so other matching transactions post immediately instead
    // of waiting for tomorrow's cron run. Excludes the transaction just
    // posted above, which classifyUnreviewed's own status filter handles.
    const sweep = await classifyUnreviewed(sb);

    return Response.json({ ok: true, journalEntryId: entryId, ruleId, sweep });
  } catch (err) {
    console.error("ACCOUNTING_INBOX_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
