"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { AlertTriangle } from "lucide-react";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type ProjectionRow = {
  period_month: string;
  proj_revenue: number | null;
  act_revenue: number | null;
  var_revenue: number | null;
  proj_ebitda: number | null;
  act_ebitda: number | null;
  var_ebitda: number | null;
  debt_service: number | null;
};

type DscrRow = { period_month: string; ebitda_ttm: number; debt_service_ttm: number; dscr_ttm: number | null };

const DSCR_MIN = 1.25;

// ── Page shell ────────────────────────────────────────────────────────────────

export default function AdminProjectionsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return (
    <section className="container-px py-12 sm:py-16 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="h2 font-bold">Projections</h1>
        <p className="text-sm text-neutral-500 mt-1">The 24-month model vs. actuals, and trailing-12 DSCR.</p>
      </div>
      <ProjectionsDashboard token={token} />
    </section>
  );
}

function ProjectionsDashboard({ token }: { token: string }) {
  const [projections, setProjections] = useState<ProjectionRow[]>([]);
  const [dscr, setDscr] = useState<DscrRow[]>([]);
  const [modelLoaded, setModelLoaded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/projections", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setProjections(json.projectionVsActual ?? []);
        setDscr(json.dscr ?? []);
        setModelLoaded(json.modelLoaded ?? false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function uploadModel() {
    setUploadMsg(null);
    // Expected CSV columns (no header): period_month,revenue,cogs,payroll,rent,marketing,other_opex,ebitda,debt_service
    const rows = csvText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [periodMonth, revenue, cogs, payroll, rent, marketing, otherOpex, ebitda, debtService] = line.split(",").map((v) => v.trim());
        return {
          periodMonth,
          revenue: revenue ? Number(revenue) : null,
          cogs: cogs ? Number(cogs) : null,
          payroll: payroll ? Number(payroll) : null,
          rent: rent ? Number(rent) : null,
          marketing: marketing ? Number(marketing) : null,
          otherOpex: otherOpex ? Number(otherOpex) : null,
          ebitda: ebitda ? Number(ebitda) : null,
          debtService: debtService ? Number(debtService) : null,
        };
      });
    if (rows.length === 0) {
      setUploadMsg("Paste at least one row first.");
      return;
    }
    try {
      const res = await fetch("/api/admin/accounting/projections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setUploadMsg(`Loaded ${json.upserted} month(s).`);
      setCsvText("");
      load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>;

  return (
    <div className="space-y-8">
      {!modelLoaded && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">No 24-month model loaded yet</p>
            <p className="text-sm text-amber-700 mt-1">
              This table starts empty on purpose — the model has to come from the business&apos;s own projections
              (the existing Google Sheet), not be invented from trailing actuals. Paste rows below to load it.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Load / update the model</p>
        <p className="text-xs text-neutral-500 mb-2">
          One row per line, comma-separated, no header: <code>period_month(YYYY-MM-01), revenue, cogs, payroll, rent, marketing, other_opex, ebitda, debt_service</code>
        </p>
        <textarea
          className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-black/40 h-28"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="2026-01-01,12000,4000,5000,3100,500,2000,,1500"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={uploadModel}
            className={`${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
          >
            LOAD ROWS
          </button>
          {uploadMsg && <p className="text-xs text-neutral-500">{uploadMsg}</p>}
        </div>
      </div>

      <div>
        <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Projection vs actual</p>
        <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className={`${vulfMono.className} w-full text-xs`}>
            <thead>
              <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Proj Revenue</th>
                <th className="px-4 py-3 text-right">Act Revenue</th>
                <th className="px-4 py-3 text-right">Var</th>
                <th className="px-4 py-3 text-right">Proj EBITDA</th>
                <th className="px-4 py-3 text-right">Act EBITDA</th>
                <th className="px-4 py-3 text-right">Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {projections.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No projection months loaded.</td></tr>
              ) : projections.map((r) => (
                <tr key={r.period_month}>
                  <td className="px-4 py-2.5 font-semibold">{r.period_month.slice(0, 7)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.proj_revenue)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.act_revenue)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.var_revenue)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.proj_ebitda)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.act_ebitda)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(r.var_ebitda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Trailing-12 DSCR (lender minimum {DSCR_MIN}x)</p>
        <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className={`${vulfMono.className} w-full text-xs`}>
            <thead>
              <tr className="border-b border-black/10 text-left text-neutral-400 uppercase tracking-wide">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">EBITDA (TTM)</th>
                <th className="px-4 py-3 text-right">Debt Service (TTM)</th>
                <th className="px-4 py-3 text-right">DSCR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {dscr.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No data yet.</td></tr>
              ) : dscr.map((r) => {
                const below = r.dscr_ttm != null && r.dscr_ttm < DSCR_MIN;
                return (
                  <tr key={r.period_month}>
                    <td className="px-4 py-2.5 font-semibold">{r.period_month.slice(0, 7)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.ebitda_ttm)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtMoney(r.debt_service_ttm)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${below ? "text-red-600" : ""}`}>
                      {r.dscr_ttm == null ? "—" : `${r.dscr_ttm.toFixed(2)}x`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
