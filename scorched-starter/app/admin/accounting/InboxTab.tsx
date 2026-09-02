"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { ArrowDownLeft, ArrowUpRight, Check, Lightbulb, X } from "lucide-react";
import type { Account } from "./types";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

// Templates postable from a single bank transaction (see lib/accounting/posting.ts).
const POSTABLE_TEMPLATES = [
  "expense", "cogs", "capex", "security_deposit", "card_payoff", "transfer",
  "loan_proceeds", "card_interest", "owner_contribution", "owner_draw",
  "sales_tax_remit", "payroll_clearing",
] as const;

const NEEDS_TARGET = new Set(["expense", "card_payoff", "transfer", "loan_proceeds"]);

type InboxTxn = {
  id: string;
  date: string;
  amount: number;
  name: string | null;
  merchant_name: string | null;
  pending: boolean;
  suggestCapex: boolean;
  bank_accounts: { name: string; mask: string | null; accounts: { code: string; name: string } | null } | null;
  locations: { key: string; name: string } | null;
  categorization_rules: { id: string; template: string; match_regex: string } | null;
};

function fmtMoney(n: number) {
  return Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Plaid's sign convention is the opposite of everyday intuition (positive =
// money left the account, negative = money came in) — showing the raw sign
// alone still leaves people unsure which way it goes, so spell it out.
function DirectionTag({ amount }: { amount: number }) {
  const out = amount > 0;
  return (
    <span
      className={`${vulfMono.className} flex items-center gap-1 text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full ${
        out ? "bg-red-50 text-red-600" : "bg-[#519A70]/10 text-[#519A70]"
      }`}
    >
      {out ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
      {out ? "Money out" : "Money in"}
    </span>
  );
}

export default function InboxTab({ token, accounts }: { token: string; accounts: Account[] }) {
  const [txns, setTxns] = useState<InboxTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [template, setTemplate] = useState<string>("expense");
  const [targetAccountCode, setTargetAccountCode] = useState("");
  const [createRule, setCreateRule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sweepMessage, setSweepMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/inbox", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ transactions, error: err }) => {
        if (err) throw new Error(err);
        setTxns(transactions ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function startCategorize(t: InboxTxn) {
    setOpenId(t.id);
    setTemplate(t.categorization_rules?.template && t.categorization_rules.template !== "inbox" ? t.categorization_rules.template : "expense");
    setTargetAccountCode("");
    setCreateRule(true);
    setError(null);
  }

  // A rule created moments ago (by categorizing a different transaction
  // from the same merchant) sweeps the whole inbox immediately — including
  // a transaction someone still has this exact form open for. If they then
  // submit, the server correctly rejects it as already handled; treat that
  // as the success it effectively is instead of a scary error.
  function isAlreadyHandled(message: string) {
    return /already (posted|ignored)/i.test(message);
  }

  async function submitCategorize(t: InboxTxn) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: t.id,
          template,
          targetAccountCode: NEEDS_TARGET.has(template) ? targetAccountCode || null : null,
          createRule: template !== "ignore" && createRule,
        }),
      });
      const body = await res.json();
      if (body.error) {
        if (isAlreadyHandled(body.error)) {
          setOpenId(null);
          setSweepMessage("This one was already categorized automatically (a rule you created moments ago matched it too) — nothing left to do here.");
          load();
          return;
        }
        throw new Error(body.error);
      }
      setOpenId(null);
      announceSweep(body.sweep);
      load(); // re-fetch: the sweep may have also posted/ignored other items, not just this one
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to categorize");
    } finally {
      setSaving(false);
    }
  }

  function announceSweep(sweep: { classified: number; posted: number } | undefined) {
    if (!sweep || sweep.classified === 0) { setSweepMessage(null); return; }
    const parts = [`${sweep.posted} other transaction${sweep.posted === 1 ? "" : "s"} posted`];
    const flaggedOrIgnored = sweep.classified - sweep.posted;
    if (flaggedOrIgnored > 0) parts.push(`${flaggedOrIgnored} flagged or ignored`);
    setSweepMessage(`Also matched existing rules: ${parts.join(", ")}.`);
  }

  async function ignoreTxn(t: InboxTxn) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transactionId: t.id, template: "ignore" }),
      });
      const body = await res.json();
      if (body.error) {
        if (isAlreadyHandled(body.error)) {
          setSweepMessage("This one was already categorized automatically (a rule you created moments ago matched it too) — nothing left to do here.");
          load();
          return;
        }
        throw new Error(body.error);
      }
      announceSweep(body.sweep);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ignore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-6">
        Nothing posts to the books without a rule or a human — anything a rule didn&apos;t recognize lands here.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}
      {sweepMessage && (
        <p className={`${vulfMono.className} text-xs text-[#519A70] bg-[#519A70]/10 rounded-lg px-4 py-3 mb-6`}>{sweepMessage}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading inbox…
        </div>
      ) : txns.length === 0 ? (
        <p className="text-sm text-neutral-400 py-12 text-center">Inbox is empty. Nice.</p>
      ) : (
        <div className="space-y-3">
          {txns.map((t) => (
            <div key={t.id} className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`${vulfMono.className} text-sm font-bold`}>{t.date}</p>
                  <span className={`${vulfMono.className} text-sm`}>{fmtMoney(t.amount)}</span>
                  <DirectionTag amount={t.amount} />
                  {t.pending && (
                    <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-400`}>Pending</span>
                  )}
                  {t.categorization_rules && (
                    <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700`}>
                      Suggested: {t.categorization_rules.template}
                    </span>
                  )}
                  {t.suggestCapex && (
                    <span className={`${vulfMono.className} flex items-center gap-1 text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700`}>
                      <Lightbulb className="w-3 h-3" /> Possible fixed asset
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-neutral-700">{t.name}</p>
              <p className="text-xs text-neutral-400 mb-3">{t.bank_accounts?.name} {t.bank_accounts?.mask ? `···${t.bank_accounts.mask}` : ""}</p>

              {openId === t.id ? (
                <div className="rounded-xl bg-neutral-50 p-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <select className={`${inputCls} max-w-[220px]`} value={template} onChange={(e) => setTemplate(e.target.value)}>
                      {POSTABLE_TEMPLATES.map((tpl) => <option key={tpl} value={tpl}>{tpl}</option>)}
                    </select>
                    {NEEDS_TARGET.has(template) && (
                      <select className={`${inputCls} max-w-[260px]`} value={targetAccountCode} onChange={(e) => setTargetAccountCode(e.target.value)}>
                        <option value="">Target account…</option>
                        {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                      </select>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-500">
                    <input type="checkbox" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
                    Create a rule so this merchant auto-posts next time
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitCategorize(t)}
                      disabled={saving}
                      className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg bg-[#519A70] px-4 py-2 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
                    >
                      <Check className="w-3.5 h-3.5" /> POST
                    </button>
                    <button
                      onClick={() => setOpenId(null)}
                      className={`${vulfMono.className} rounded-lg border border-black/20 bg-white px-4 py-2 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => startCategorize(t)}
                    className={`${vulfMono.className} rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
                  >
                    Categorize
                  </button>
                  <button
                    onClick={() => ignoreTxn(t)}
                    disabled={saving}
                    className={`${vulfMono.className} flex items-center gap-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
                  >
                    <X className="w-3 h-3" /> Ignore
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
