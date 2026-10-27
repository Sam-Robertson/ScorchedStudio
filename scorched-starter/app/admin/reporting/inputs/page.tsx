"use client";

// The two hand-entered inputs the dashboard's Financials section reports on: the
// 24-month projection model (one month at a time) and normalized-EBITDA
// add-backs. They used to live inside the deleted in-app reporting pages;
// the dashboard itself cannot write back to this app, so the forms live here.

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

// ── Projection model ──────────────────────────────────────────────────────────

type ProjectionRow = {
  period_month: string;
  proj_revenue: number | null;
  proj_ebitda: number | null;
  debt_service: number | null;
};

// One labeled numeric input per model column, entered a month at a time.
const MODEL_FIELDS = [
  { key: "revenue", label: "Revenue" },
  { key: "cogs", label: "COGS" },
  { key: "payroll", label: "Payroll" },
  { key: "rent", label: "Rent" },
  { key: "marketing", label: "Marketing" },
  { key: "otherOpex", label: "Other OpEx" },
  { key: "ebitda", label: "EBITDA" },
  { key: "debtService", label: "Debt Service" },
] as const;
type ModelFieldKey = (typeof MODEL_FIELDS)[number]["key"];
type ModelFormState = Record<ModelFieldKey, string>;

const EMPTY_MODEL_FORM: ModelFormState = {
  revenue: "", cogs: "", payroll: "", rent: "", marketing: "", otherOpex: "", ebitda: "", debtService: "",
};

function ProjectionModelCard({ token }: { token: string }) {
  const [rows, setRows] = useState<ProjectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMonth, setFormMonth] = useState("");
  const [form, setForm] = useState<ModelFormState>(EMPTY_MODEL_FORM);
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

  // Submits one month of the model at a time, in the { rows: [...] } shape the
  // projections route upserts.
  async function saveMonth(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!formMonth) {
      setMsg("Pick a month first.");
      return;
    }
    for (const { key, label } of MODEL_FIELDS) {
      if (form[key].trim() !== "" && Number.isNaN(Number(form[key]))) {
        setMsg(`${label} must be a number (or left blank).`);
        return;
      }
    }
    const num = (key: ModelFieldKey) => (form[key].trim() === "" ? null : Number(form[key]));
    const row = {
      periodMonth: `${formMonth}-01`,
      revenue: num("revenue"),
      cogs: num("cogs"),
      payroll: num("payroll"),
      rent: num("rent"),
      marketing: num("marketing"),
      otherOpex: num("otherOpex"),
      ebitda: num("ebitda"),
      debtService: num("debtService"),
    };
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accounting/projections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: [row] }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMsg(`Saved ${formMonth}.`);
      setForm(EMPTY_MODEL_FORM);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10">
        <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>Projection model</p>
      </div>
      <form onSubmit={saveMonth} className="p-6">
        <p className="text-xs text-neutral-500 mb-4">
          One month at a time. Saving a month that is already loaded overwrites it. Leave a field blank to store no value.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Month</label>
            <input
              type="month"
              className={`${inputCls} w-full`}
              value={formMonth}
              onChange={(e) => setFormMonth(e.target.value)}
              required
            />
          </div>
          {MODEL_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-neutral-500 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                className={`${inputCls} w-full`}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="submit" disabled={saving} className={buttonCls}>
            {saving ? "SAVING" : "SAVE MONTH"}
          </button>
          {msg && <p className="text-xs text-neutral-500">{msg}</p>}
        </div>
      </form>

      <div className="border-t border-black/10">
        <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 px-6 pt-4 pb-2`}>Loaded months</p>
        {loading ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>Loading</p>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg mx-6 mb-5 px-4 py-3">{error}</p>
        ) : rows.length === 0 ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400 px-6 pb-5`}>No projection months loaded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${vulfMono.className} w-full text-xs`}>
              <thead>
                <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
                  <th className="px-6 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Proj Revenue</th>
                  <th className="px-4 py-2 text-right font-medium">Proj EBITDA</th>
                  <th className="px-6 py-2 text-right font-medium">Debt Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((r) => (
                  <tr key={r.period_month}>
                    <td className="px-6 py-2 font-semibold whitespace-nowrap">{monthLabel(r.period_month)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.proj_revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.proj_ebitda)}</td>
                    <td className="px-6 py-2 text-right tabular-nums">{fmtMoney(r.debt_service)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          These numbers feed the Financials section of the dashboard. It shows them after its next data refresh.
        </p>
      </div>
      <div className="space-y-6">
        <ProjectionModelCard token={token} />
        <AdjustmentsCard token={token} />
      </div>
    </section>
  );
}
