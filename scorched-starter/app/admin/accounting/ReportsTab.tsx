"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Printer } from "lucide-react";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type PlMonth = {
  period_month: string;
  location_id: string | null;
  revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  net_income: number;
};

type PlLine = { period_month: string; location_id: string | null; code: string; name: string; type: string; amount: number };
type BalanceSheetRow = { code: string; name: string; type: string; balance: number };
type CashFlowRow = { period_month: string; activity: string; net_change: number };
type SeasonalityRow = { period_month: string; revenue: number; ttm_avg: number | null; index: number | null };
type NormalizedRow = { period_month: string; ebitda: number; adjustments: number; ebitda_normalized: number };
type Adjustment = { id: string; period_month: string; label: string; amount: number; note: string | null; include: boolean };

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

type ReportView = "pl" | "balance-sheet" | "cash-flow" | "seasonality" | "normalized";

const VIEW_LABEL: Record<ReportView, string> = {
  pl: "P&L",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
  seasonality: "Seasonality",
  normalized: "Normalized",
};

export default function ReportsTab({ token }: { token: string }) {
  const [view, setView] = useState<ReportView>("pl");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className={`${vulfMono.className} flex gap-1 flex-wrap`}>
          {(Object.keys(VIEW_LABEL) as ReportView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs tracking-wide uppercase font-semibold transition-colors ${
                view === v ? "bg-[#884A20] text-white" : "bg-black/5 text-neutral-600 hover:bg-black/10"
              }`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </button>
      </div>

      {view === "pl" && <PlView token={token} />}
      {view === "balance-sheet" && <BalanceSheetView token={token} />}
      {view === "cash-flow" && <CashFlowView token={token} />}
      {view === "seasonality" && <SeasonalityView token={token} />}
      {view === "normalized" && <NormalizedView token={token} />}
    </div>
  );
}

function useReport<T>(url: string, token: string, extract: (json: unknown) => T) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json?.error) throw new Error(json.error);
        setData(extract(json));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function loadingOrErrorNode(loading: boolean, error: string | null) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>;
  return null;
}

function monthLabel(period_month: string) {
  return period_month.slice(0, 7);
}

function PlView({ token }: { token: string }) {
  const { data, loading, error } = useReport(
    "/api/admin/accounting/reports/pl",
    token,
    (json) => (json as { months: PlMonth[]; lines: PlLine[] })
  );
  const guard = loadingOrErrorNode(loading, error);
  if (guard) return guard;

  // The view groups by (month, location), but most bank-rule postings carry
  // no location_id while revenue settlements do — for this single-location
  // business that splits every month into a mostly-revenue row and a
  // mostly-expense row. Merge by month here; a per-location breakdown can
  // come back once a locationId filter is wired up for multi-location use.
  const byMonth = new Map<string, PlMonth>();
  for (const m of data?.months ?? []) {
    const existing = byMonth.get(m.period_month);
    if (!existing) {
      byMonth.set(m.period_month, { ...m, location_id: null });
      continue;
    }
    existing.revenue += m.revenue;
    existing.cogs += m.cogs;
    existing.gross_profit += m.gross_profit;
    existing.operating_expenses += m.operating_expenses;
    existing.ebitda += m.ebitda;
    existing.depreciation += m.depreciation;
    existing.interest += m.interest;
    existing.net_income += m.net_income;
  }
  const months = [...byMonth.values()].sort((a, b) => a.period_month.localeCompare(b.period_month));

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className={`${vulfMono.className} w-full text-xs`}>
        <thead>
          <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
            <th className="px-4 py-3">Month</th>
            <th className="px-4 py-3 text-right">Revenue</th>
            <th className="px-4 py-3 text-right">COGS</th>
            <th className="px-4 py-3 text-right">Gross Profit</th>
            <th className="px-4 py-3 text-right">OpEx</th>
            <th className="px-4 py-3 text-right">EBITDA</th>
            <th className="px-4 py-3 text-right">Depreciation</th>
            <th className="px-4 py-3 text-right">Interest</th>
            <th className="px-4 py-3 text-right">Net Income</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {months.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-neutral-400">No posted activity yet.</td></tr>
          ) : months.map((m) => (
            <tr key={m.period_month}>
              <td className="px-4 py-2.5 font-semibold">{monthLabel(m.period_month)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.revenue)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.cogs)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.gross_profit)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.operating_expenses)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney(m.ebitda)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.depreciation)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(m.interest)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney(m.net_income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceSheetView({ token }: { token: string }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, error } = useReport(
    `/api/admin/accounting/reports/balance-sheet?asOf=${asOf}`,
    token,
    (json) => (json as { rows: BalanceSheetRow[] }).rows
  );

  const rows = data ?? [];
  const byType = (t: string) => rows.filter((r) => r.type === t);
  const totalOf = (t: string) => byType(t).reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <label className="text-xs text-neutral-500">As of</label>
        <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </div>
      {loading || error ? loadingOrErrorNode(loading, error) : (
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
          {([
            { key: "asset", label: "Assets" },
            { key: "liability", label: "Liabilities" },
            { key: "equity", label: "Equity" },
          ] as const).map(({ key: t, label }) => (
            <div key={t} className="px-4 py-3">
              <p className={`${vulfMono.className} text-xs uppercase tracking-widest text-neutral-400 mb-2`}>{label}</p>
              {byType(t).map((r) => (
                <div key={r.code} className="flex items-center justify-between text-sm py-1">
                  <span>{r.code} — {r.name}</span>
                  <span className={vulfMono.className}>{fmtMoney(r.balance)}</span>
                </div>
              ))}
              <div className={`flex items-center justify-between text-sm py-1 font-semibold border-t border-black/10 mt-1 pt-1 ${vulfMono.className}`}>
                <span>Total {label.toLowerCase()}</span>
                <span>{fmtMoney(totalOf(t))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashFlowView({ token }: { token: string }) {
  const { data, loading, error } = useReport(
    "/api/admin/accounting/reports/cash-flow",
    token,
    (json) => (json as { rows: CashFlowRow[] }).rows
  );
  const guard = loadingOrErrorNode(loading, error);
  if (guard) return guard;
  const rows = data ?? [];
  const months = [...new Set(rows.map((r) => r.period_month))].sort();

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className={`${vulfMono.className} w-full text-xs`}>
        <thead>
          <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
            <th className="px-4 py-3">Month</th>
            <th className="px-4 py-3 text-right">Operating</th>
            <th className="px-4 py-3 text-right">Investing</th>
            <th className="px-4 py-3 text-right">Financing</th>
            <th className="px-4 py-3 text-right">Net Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {months.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400">No posted activity yet.</td></tr>
          ) : months.map((m) => {
            const op = rows.find((r) => r.period_month === m && r.activity === "operating")?.net_change ?? 0;
            const inv = rows.find((r) => r.period_month === m && r.activity === "investing")?.net_change ?? 0;
            const fin = rows.find((r) => r.period_month === m && r.activity === "financing")?.net_change ?? 0;
            return (
              <tr key={m}>
                <td className="px-4 py-2.5 font-semibold">{monthLabel(m)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney(op)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney(inv)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney(fin)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney(op + inv + fin)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SeasonalityView({ token }: { token: string }) {
  const { data, loading, error } = useReport(
    "/api/admin/accounting/reports/seasonality",
    token,
    (json) => (json as { rows: SeasonalityRow[] }).rows
  );
  const guard = loadingOrErrorNode(loading, error);
  if (guard) return guard;
  const rows = data ?? [];

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className={`${vulfMono.className} w-full text-xs`}>
        <thead>
          <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
            <th className="px-4 py-3">Month</th>
            <th className="px-4 py-3 text-right">Revenue</th>
            <th className="px-4 py-3 text-right">TTM Avg</th>
            <th className="px-4 py-3 text-right">Index</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No posted activity yet.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.period_month}>
              <td className="px-4 py-2.5 font-semibold">{monthLabel(r.period_month)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(r.revenue)}</td>
              <td className="px-4 py-2.5 text-right">{fmtMoney(r.ttm_avg)}</td>
              <td className="px-4 py-2.5 text-right">{r.index == null ? "—" : r.index.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NormalizedView({ token }: { token: string }) {
  const { data, loading, error, reload } = useReport(
    "/api/admin/accounting/reports/normalized",
    token,
    (json) => (json as { normalized: NormalizedRow[]; adjustments: Adjustment[] })
  );
  const [periodMonth, setPeriodMonth] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const guard = loadingOrErrorNode(loading, error);

  async function addAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(amount);
    if (!periodMonth || !label || Number.isNaN(amt)) {
      setFormError("Month, label, and a numeric amount are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accounting/reports/normalized", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ periodMonth: `${periodMonth}-01`, label, amount: amt, note: note || undefined }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLabel(""); setAmount(""); setNote("");
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addAdjustment} className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Month</label>
          <input type="month" className={inputCls} value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} required />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-neutral-500 mb-1">Label</label>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Owner health insurance add-back" required />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Amount</label>
          <input type="number" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="positive = add back" required />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-neutral-500 mb-1">Note (optional)</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" disabled={saving} className={`${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}>
          ADD
        </button>
      </form>
      {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{formError}</p>}

      {guard || (
        <>
          <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
            <table className={`${vulfMono.className} w-full text-xs`}>
              <thead>
                <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Base EBITDA</th>
                  <th className="px-4 py-3 text-right">Adjustments</th>
                  <th className="px-4 py-3 text-right">Normalized EBITDA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {(data?.normalized ?? []).map((r) => (
                  <tr key={r.period_month}>
                    <td className="px-4 py-2.5 font-semibold">{monthLabel(r.period_month)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.ebitda)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.adjustments)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney(r.ebitda_normalized)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Adjustment list (never hidden)</p>
            <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5">
              {(data?.adjustments ?? []).length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">No adjustments recorded.</p>
              ) : data!.adjustments.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p>{monthLabel(a.period_month)} — {a.label}</p>
                    {a.note && <p className="text-xs text-neutral-500">{a.note}</p>}
                  </div>
                  <span className={vulfMono.className}>{fmtMoney(a.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
