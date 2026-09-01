"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Download } from "lucide-react";

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type TaxRow = { code: string; name: string; type: string; tax_line: string | null; amount: number };

async function downloadCsv(url: string, token: string, filename: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function TaxExportTab({ token }: { token: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<TaxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/accounting/tax-export?year=${year}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setRows(json.rows ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token, year]);

  useEffect(() => { load(); }, [load]);

  const byTaxLine = new Map<string, { rows: TaxRow[]; total: number }>();
  for (const r of rows) {
    const key = r.tax_line ?? "Unmapped";
    const bucket = byTaxLine.get(key) ?? { rows: [], total: 0 };
    bucket.rows.push(r);
    bucket.total += Number(r.amount);
    byTaxLine.set(key, bucket);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Year</label>
          <input
            type="number"
            className="rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-28"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadCsv(`/api/admin/accounting/tax-export?year=${year}&format=transactions-csv`, token, `transaction-detail-${year}.csv`)}
            className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
          >
            <Download className="w-3.5 h-3.5" /> Transaction detail CSV
          </button>
          <button
            onClick={() => downloadCsv(`/api/admin/accounting/tax-export?format=assets-csv`, token, "fixed-assets-register.csv")}
            className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
          >
            <Download className="w-3.5 h-3.5" /> Fixed-asset register CSV
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Book depreciation is shown as a reference figure only — the CPA determines tax depreciation (MACRS / Section 179 / bonus)
        from the fixed-asset register export, not from this number.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5">
          {byTaxLine.size === 0 ? (
            <p className="text-sm text-neutral-400 py-12 text-center">No activity for {year}.</p>
          ) : [...byTaxLine.entries()].map(([taxLine, bucket]) => (
            <div key={taxLine} className="px-4 py-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{taxLine}</span>
                <span className={vulfMono.className}>{fmtMoney(bucket.total)}</span>
              </div>
              {bucket.rows.map((r) => (
                <div key={r.code} className="flex items-center justify-between text-xs text-neutral-500 pl-3 py-1">
                  <span>{r.code} — {r.name}</span>
                  <span className={vulfMono.className}>{fmtMoney(Number(r.amount))}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
