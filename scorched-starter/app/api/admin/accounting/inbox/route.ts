// app/api/admin/accounting/inbox/route.ts
// GET lists unreviewed bank transactions (the safety net — nothing posts to
// the P&L without a rule or a human, build spec §6). POST categorizes one:
// posts a journal entry via the same template engine the rules cron uses,
// and optionally creates a categorization rule from the override so the
// same merchant auto-posts next time.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { buildLinesForBankRule } from "@/lib/accounting/posting";
import type { CategorizationRule } from "@/lib/accounting/rules";

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

    // §6 priority-90 heuristic: any large debit at a merchant no rule
    // recognized is a candidate fixed-asset purchase worth a second look —
    // this is a UI hint, not an auto-applied template (fixed_assets register
    // creation for `capex` lands in Phase 4).
    const withHints = (data ?? []).map((t) => ({
      ...t,
      suggestCapex: !t.categorization_rules && t.amount >= CAPEX_SUGGESTION_THRESHOLD,
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
      return Response.json({ ok: true, status: "ignored" });
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

    return Response.json({ ok: true, journalEntryId: entryId, ruleId });
  } catch (err) {
    console.error("ACCOUNTING_INBOX_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
