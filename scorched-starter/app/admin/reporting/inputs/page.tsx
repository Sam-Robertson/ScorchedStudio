"use client";

// The two hand-entered inputs the dashboard's Plan group reports on: monthly
// revenue and profit targets (the projection_months table, which the Targets
// tab paces the month against) and normalized-EBITDA add-backs. They used to
// live inside the deleted in-app reporting pages; the dashboard itself cannot
// write back to this app, so the forms live here.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "--";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthLabel(period_month: string) {
  return period_month.slice(0, 7);
}

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";
const buttonCls =
  `${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`;

// ── Monthly targets ───────────────────────────────────────────────────────────
// Two numbers per month: the revenue and the profit (EBITDA) you want. The
// dashboard's Targets tab paces the month against them and Home shows the gap.
// A range of months can be set in one go. The expense lines of the older
// 24-month model are still accepted, folded away under "More detail".

type TargetRow = {
  period_month: string;
  proj_revenue: number | null;
  proj_ebitda: number | null;
  act_revenue: number | null;
  act_ebitda: number | null;
  debt_service: number | null;
};

const DETAIL_FIELDS = [
  { key: "cogs", label: "COGS" },
  { key: "payroll", label: "Payroll" },
  { key: "rent", label: "Rent" },
  { key: "marketing", label: "Marketing" },
  { key: "otherOpex", label: "Other OpEx" },
  { key: "debtService", label: "Debt service" },
] as const;
type DetailKey = (typeof DETAIL_FIELDS)[number]["key"];
type DetailState = Record<DetailKey, string>;
const EMPTY_DETAIL: DetailState = { cogs: "", payroll: "", rent: "", marketing: "", otherOpex: "", debtService: "" };
const MAX_MONTHS = 24;

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return ymOf(d);
}
function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
function parseOptional(value: string): number | null | undefined {
  const v = value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
function thisMonthKey() {
  return ymOf(new Date());
}

function TargetsCard({ token }: { token: string }) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(nextMonth());
  const [to, setTo] = useState("");
  const [revenue, setRevenue] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/projections", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setRows(json.projectionVsActual ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function editMonth(r: TargetRow) {
    const ym = r.period_month.slice(0, 7);
    setFrom(ym);
    setTo("");
    setRevenue(r.proj_revenue == null ? "" : String(r.proj_revenue));
    setEbitda(r.proj_ebitda == null ? "" : String(r.proj_ebitda));
    setMsg(`Editing ${ym}. Change the numbers and save.`);
  }

  // Posts one row per month in the range, in the { rows: [...] } shape the
  // projections route upserts (a saved month replaces what was there).
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!from) { setMsg("Pick a starting month."); return; }
    const last = to || from;
    if (last < from) { setMsg("The end month is before the start month."); return; }
    const months = monthsBetween(from, last);
    if (months.length > MAX_MONTHS) { setMsg(`That is ${months.length} months; ${MAX_MONTHS} at a time is the limit.`); return; }
    const rev = parseOptional(revenue), eb = parseOptional(ebitda);
    if (rev === undefined || eb === undefined) { setMsg("Targets must be numbers."); return; }
    if (rev == null && eb == null) { setMsg("Enter a revenue target, a profit target, or both."); return; }
    const extra: Partial<Record<DetailKey, number | null>> = {};
    for (const { key, label } of DETAIL_FIELDS) {
      const v = parseOptional(detail[key]);
      if (v === undefined) { setMsg(`${label} must be a number (or left blank).`); return; }
      extra[key] = v;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accounting/projections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: months.map((m) => ({ periodMonth: `${m}-01`, revenue: rev, ebitda: eb, ...extra })) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMsg(months.length === 1 ? `Saved ${months[0]}. The dashboard shows it after its next refresh.` : `Saved ${months.length} months, ${months[0]} to ${months[months.length - 1]}. The dashboard shows them after its next refresh.`);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const current = thisMonthKey();
  const gapCls = (actual: number | null, target: number | null) =>
    actual == null || target == null ? "text-neutral-400" : actual >= target ? "text-emerald-700" : "text-red-600";

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10">
        <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>Monthly targets</p>
      </div>
      <form onSubmit={save} className="p-6">
        <p className="text-sm text-neutral-600 mb-1">
          Pick the months, type the revenue you want and the profit you want, save. That is the whole job.
        </p>
        <p className="text-xs text-neutral-500 mb-4">
          Profit here is EBITDA: revenue minus all costs except depreciation and interest. Saving a month that already has targets overwrites it. Leave the end month blank to set a single month.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">From month</label>
            <input type="month" className={`${inputCls} w-full`} value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">To month (optional)</label>
            <input type="month" className={`${inputCls} w-full`} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Revenue target</label>
            <input type="number" step="1" inputMode="decimal" placeholder="e.g. 12000" className={`${inputCls} w-full`} value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Profit target (EBITDA)</label>
            <input type="number" step="1" inputMode="decimal" placeholder="e.g. 1500" className={`${inputCls} w-full`} value={ebitda} onChange={(e) => setEbitda(e.target.value)} />
          </div>
        </div>
        <button type="button" className="mt-3 text-xs text-neutral-500 underline underline-offset-2" onClick={() => setShowDetail((s) => !s)} aria-expanded={showDetail}>
          {showDetail ? "Hide the optional expense lines" : "More detail (optional expense lines)"}
        </button>
        {showDetail && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {DETAIL_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-neutral-500 mb-1">{label}</label>
                <input type="number" step="0.01" className={`${inputCls} w-full`} value={detail[key]} onChange={(e) => setDetail((d) => ({ ...d, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button type="submit" disabled={saving} className={buttonCls}>
            {saving ? "SAVING" : "SAVE TARGETS"}
          </button>
          {msg && <p className="text-xs text-neutral-500">{msg}</p>}
        </div>
      </form>

      <div className="border-t border-black/10">
        <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 px-6 pt-4 pb-2`}>Months with targets</p>
        {loading ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>Loading</p>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg mx-6 mb-5 px-4 py-3">{error}</p>
        ) : rows.length === 0 ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>None yet. Set the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${vulfMono.className} w-full text-xs`}>
              <thead>
                <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
                  <th className="px-6 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue target</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Profit target</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((r) => {
                  const ym = r.period_month.slice(0, 7);
                  const past = ym < current;
                  return (
                    <tr key={r.period_month}>
                      <td className="px-6 py-2 font-semibold whitespace-nowrap">{monthLabel(r.period_month)}{ym === current ? <span className="ml-2 text-[10px] text-neutral-400">in progress</span> : null}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.proj_revenue)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${past ? gapCls(r.act_revenue, r.proj_revenue) : "text-neutral-400"}`}>{fmtMoney(r.act_revenue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.proj_ebitda)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${past ? gapCls(r.act_ebitda, r.proj_ebitda) : "text-neutral-400"}`}>{fmtMoney(r.act_ebitda)}</td>
                      <td className="px-6 py-2 text-right">
                        <button type="button" className="text-neutral-500 underline underline-offset-2" onClick={() => editMonth(r)}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-neutral-400 px-6 py-3">Green means the month reached its target, red means it fell short. Months still in progress are grey.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Normalized EBITDA adjustments ─────────────────────────────────────────────

type Adjustment = { id: string; period_month: string; label: string; amount: number; note: string | null; include: boolean };

function AdjustmentsCard({ token }: { token: string }) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodMonth, setPeriodMonth] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/reports/normalized", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setAdjustments(json.adjustments ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function addAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const amt = parseFloat(amount);
    if (!periodMonth || !label || Number.isNaN(amt)) {
      setMsg("Month, label, and a numeric amount are required.");
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
      setMsg(`Added ${label} for ${periodMonth}.`);
      setLabel(""); setAmount(""); setNote("");
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10">
        <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>Normalized EBITDA adjustments</p>
      </div>
      <form onSubmit={addAdjustment} className="p-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto">
          <label className="block text-xs text-neutral-500 mb-1">Month</label>
          <input type="month" className={`${inputCls} w-full sm:w-auto`} value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} required />
        </div>
        <div className="w-full sm:w-auto sm:flex-1 min-w-[160px]">
          <label className="block text-xs text-neutral-500 mb-1">Label</label>
          <input className={`${inputCls} w-full`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Owner health insurance add-back" required />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs text-neutral-500 mb-1">Amount</label>
          <input type="number" step="0.01" className={`${inputCls} w-full sm:w-auto`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="positive = add back" required />
        </div>
        <div className="w-full sm:w-auto sm:flex-1 min-w-[160px]">
          <label className="block text-xs text-neutral-500 mb-1">Note (optional)</label>
          <input className={`${inputCls} w-full`} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" disabled={saving} className={buttonCls}>
          {saving ? "ADDING" : "ADD"}
        </button>
        {msg && <p className="w-full text-xs text-neutral-500">{msg}</p>}
      </form>

      <div className="border-t border-black/10">
        <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 px-6 pt-4 pb-2`}>Adjustment list (never hidden)</p>
        {loading ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>Loading</p>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg mx-6 mb-5 px-4 py-3">{error}</p>
        ) : adjustments.length === 0 ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>No adjustments recorded.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {adjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                <div>
                  <p>{monthLabel(a.period_month)}, {a.label}</p>
                  {a.note && <p className="text-xs text-neutral-500">{a.note}</p>}
                </div>
                <span className={`${vulfMono.className} shrink-0 tabular-nums`}>{fmtMoney(a.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function AdminReportInputsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;

  return (
    <section className="container-px py-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <p className="eyebrow text-brand">Admin</p>
        <h1 className="h2 font-bold">Report inputs</h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-xl">
          These numbers feed the Plan group of the dashboard (Targets and Normalized EBITDA). It shows them after its next data refresh.
        </p>
      </div>
      <div className="space-y-6">
        <TargetsCard token={token} />
        <AdjustmentsCard token={token} />
      </div>
    </section>
  );
}
