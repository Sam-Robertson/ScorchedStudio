"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Printer } from "lucide-react";
import { DateRangeFilter, rangeToQuery, fmtMoney0, monthShort, type RangeState } from "./reports/shared";
import PlOverviewView from "./reports/PlOverviewView";
import PlDetailsView from "./reports/PlDetailsView";
import SalesOverviewView from "./reports/SalesOverviewView";
import CostsView from "./reports/CostsView";

// Full-cents formatter kept for Normalized EBITDA (add-back amounts are
// entered to the cent); the report tables use shared fmtMoney0.
function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type BalanceSheetRow = { code: string; name: string; type: string; balance: number };
type CashFlowRow = { period_month: string; activity: string; net_change: number };
type NormalizedRow = { period_month: string; ebitda: number; adjustments: number; ebitda_normalized: number };
type Adjustment = { id: string; period_month: string; label: string; amount: number; note: string | null; include: boolean };

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

type ReportView =
  | "pl-overview" | "pl-details" | "sales" | "costs"
  | "balance-sheet" | "cash-flow" | "normalized";

const VIEW_LABEL: Record<ReportView, string> = {
  "pl-overview": "P&L Overview",
  "pl-details": "Monthly P&L",
  sales: "Sales & Products",
  costs: "Costs",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
  normalized: "Normalized",
};

const DASHBOARD_VIEWS: ReportView[] = ["pl-overview", "pl-details", "sales", "costs"];

// ── Page shell ────────────────────────────────────────────────────────────────

export default function AdminFinancialsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <FinancialsDashboard token={token} />;
}

function FinancialsDashboard({ token }: { token: string }) {
  const [view, setView] = useState<ReportView>("pl-overview");
  // Date range shared by the dashboard views, persisted across view switches.
  // Defaults to a recent window so the page opens on current performance,
  // not an all-time cumulative figure dominated by pre-launch months.
  const [range, setRange] = useState<RangeState>({ preset: "3m" });
  const query = rangeToQuery(range);
  const isDashboard = DASHBOARD_VIEWS.includes(view);

  return (
    <section className="container-px py-12 sm:py-16 max-w-5xl mx-auto">
      <div className="mb-8 print:hidden">
        <h1 className="h2 font-bold">Financials</h1>
        <p className="text-sm text-neutral-500 mt-1">P&amp;L, sales, costs, balance sheet, and cash flow — built from the accounting ledger.</p>
      </div>
      <div className="flex items-start justify-between gap-4 mb-4 print:hidden">
        <div className={`${vulfMono.className} flex gap-1 flex-wrap`}>
          {(Object.keys(VIEW_LABEL) as ReportView[]).filter((v) => v !== "normalized").map((v) => (
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
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 shrink-0`}
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </button>
      </div>

      {/* Secondary, deliberately muted entry point — real feature, but for a
          future financing/sale conversation, not daily use. */}
      <div className="mb-4 print:hidden">
        <button
          onClick={() => setView("normalized")}
          className={`${vulfMono.className} text-xs underline underline-offset-2 transition-colors ${
            view === "normalized" ? "text-[#884A20] font-semibold" : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Normalized EBITDA
        </button>
        <span className={`${vulfMono.className} text-xs text-neutral-400 ml-2`}>for financing / sale prep</span>
      </div>

      {isDashboard && (
        <div className="mb-6 print:hidden">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      )}

      {/* All views stay mounted; tab switches only toggle visibility, so each
          view keeps its already-fetched data instead of reloading every time. */}
      <div className={view === "pl-overview" ? "" : "hidden"}><PlOverviewView token={token} query={query} /></div>
      <div className={view === "pl-details" ? "" : "hidden"}><PlDetailsView token={token} query={query} /></div>
      <div className={view === "sales" ? "" : "hidden"}><SalesOverviewView token={token} query={query} /></div>
      <div className={view === "costs" ? "" : "hidden"}><CostsView token={token} query={query} /></div>
      <div className={view === "balance-sheet" ? "" : "hidden"}><BalanceSheetView token={token} /></div>
      <div className={view === "cash-flow" ? "" : "hidden"}><CashFlowView token={token} /></div>
      <div className={view === "normalized" ? "" : "hidden"}><NormalizedView token={token} /></div>
    </section>
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
                  <span className={vulfMono.className}>{fmtMoney0(r.balance)}</span>
                </div>
              ))}
              <div className={`flex items-center justify-between text-sm py-1 font-semibold border-t border-black/10 mt-1 pt-1 ${vulfMono.className}`}>
                <span>Total {label.toLowerCase()}</span>
                <span>{fmtMoney0(totalOf(t))}</span>
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
  // Newest first, so recent activity is at the top.
  const months = [...new Set(rows.map((r) => r.period_month))].sort().reverse();

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className={`${vulfMono.className} w-full text-xs`}>
        <thead>
          <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
            <th className="px-4 py-3 sticky left-0 z-10 bg-white">Month</th>
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
                <td className="px-4 py-2.5 font-semibold sticky left-0 z-10 bg-white">{monthShort(m)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney0(op)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney0(inv)}</td>
                <td className="px-4 py-2.5 text-right">{fmtMoney0(fin)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney0(op + inv + fin)}</td>
              </tr>
            );
          })}
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
