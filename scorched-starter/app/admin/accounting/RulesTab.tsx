"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Plus } from "lucide-react";
import type { Account } from "./types";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

type Rule = {
  id: string;
  priority: number;
  match_field: string;
  match_regex: string;
  direction: string | null;
  template: string;
  active: boolean;
  hit_count: number;
  created_from_override: boolean;
  accounts: { code: string; name: string } | null;
};

export default function RulesTab({ token, accounts }: { token: string; accounts: Account[] }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [priority, setPriority] = useState(100);
  const [matchRegex, setMatchRegex] = useState("");
  const [direction, setDirection] = useState<"" | "debit" | "credit">("");
  const [template, setTemplate] = useState("expense");
  const [targetAccountCode, setTargetAccountCode] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/rules", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ rules: list, error: err }) => {
        if (err) throw new Error(err);
        setRules(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority, matchRegex, direction: direction || null, template, targetAccountCode: targetAccountCode || null }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      setMatchRegex("");
      setShowNew(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: Rule) {
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: r.id, active: !r.active }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      setRules((prev) => prev.map((x) => (x.id === r.id ? body.rule : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rule");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-neutral-500">Lowest priority evaluates first; first match wins.</p>
        <button
          onClick={() => setShowNew((v) => !v)}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
        >
          <Plus className="w-3.5 h-3.5" /> NEW RULE
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}

      {showNew && (
        <form onSubmit={addRule} className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input className={inputCls} type="number" placeholder="Priority" value={priority} onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)} />
            <input className={`${inputCls} sm:col-span-2`} placeholder="Match regex (against transaction name)" value={matchRegex} onChange={(e) => setMatchRegex(e.target.value)} required />
            <select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="">Any direction</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className={inputCls} value={template} onChange={(e) => setTemplate(e.target.value)}>
              {["expense","cogs","capex","security_deposit","card_payoff","transfer","loan_proceeds","card_interest","owner_contribution","owner_draw","sales_tax_remit","payroll_clearing","ignore","inbox"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select className={inputCls} value={targetAccountCode} onChange={(e) => setTargetAccountCode(e.target.value)}>
              <option value="">No target account</option>
              {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={`${vulfMono.className} rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}>
              {saving ? "SAVING…" : "SAVE"}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className={`${vulfMono.className} rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}>
              CANCEL
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading rules…
        </div>
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
          {rules.map((r) => (
            <div key={r.id} className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${!r.active ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className={`${vulfMono.className} text-xs text-neutral-400`}>#{r.priority} · {r.match_field}</p>
                <p className="font-mono text-xs truncate">{r.match_regex}</p>
                <p className="text-xs text-neutral-500">
                  {r.direction ?? "any"} → {r.template}{r.accounts ? ` (${r.accounts.code})` : ""} · {r.hit_count} hits
                  {r.created_from_override ? " · from override" : ""}
                </p>
              </div>
              <button
                onClick={() => toggleActive(r)}
                className={`${vulfMono.className} flex-shrink-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
              >
                {r.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
