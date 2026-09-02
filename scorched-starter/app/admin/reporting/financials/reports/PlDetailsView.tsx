"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  PlResponse, useRangedReport, LoadingOrError, mergePlMonths, sumLinesByMonth,
  dropEmptyTrailingMonths, Section, DataGapBanner, fmtMoney0, monthShort,
} from "./shared";

const LABOR_CODES = ["6000", "6010"];

type Row = {
  period_month: string;
  revenue: number;
  cogs: number;
  labor: number;
  gross: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  net: number;
};
type SortCol = "month" | "revenue" | "cogs" | "labor" | "gross" | "opex" | "ebitda" | "depreciation" | "interest" | "net";
type SortDir = "desc" | "asc";

export default function PlDetailsView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<PlResponse>("/api/admin/accounting/reports/pl", token, query);
  const [sortCol, setSortCol] = useState<SortCol>("month");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo<Row[]>(() => {
    const months = dropEmptyTrailingMonths(mergePlMonths(data?.months ?? []));
    const labor = sumLinesByMonth(data?.lines ?? [], LABOR_CODES);
    const out = months.map((m) => ({
      period_month: m.period_month,
      revenue: m.revenue,
      cogs: m.cogs,
      labor: labor.get(m.period_month) ?? 0,
      gross: m.gross_profit,
      opex: m.operating_expenses,
      ebitda: m.ebitda,
      depreciation: m.depreciation,
      interest: m.interest,
      net: m.net_income,
    }));
    out.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "month") cmp = a.period_month.localeCompare(b.period_month);
      else cmp = a[sortCol] - b[sortCol];
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out;
  }, [data, sortCol, sortDir]);

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({
      revenue: t.revenue + r.revenue,
      cogs: t.cogs + r.cogs,
      labor: t.labor + r.labor,
      gross: t.gross + r.gross,
      opex: t.opex + r.opex,
      ebitda: t.ebitda + r.ebitda,
      depreciation: t.depreciation + r.depreciation,
      interest: t.interest + r.interest,
      net: t.net + r.net,
    }),
    { revenue: 0, cogs: 0, labor: 0, gross: 0, opex: 0, ebitda: 0, depreciation: 0, interest: 0, net: 0 },
  ), [rows]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const Th = ({ label, col, right, sticky }: { label: string; col: SortCol; right?: boolean; sticky?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-4 pb-3 pt-4 font-medium whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 ${right ? "text-right" : ""} ${sortCol === col ? "text-neutral-700" : ""} ${sticky ? "sticky left-0 z-10 bg-white" : ""}`}
    >
      {label}{sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      <DataGapBanner dataStartsAt={data?.dataStartsAt} />

      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <Section title="Monthly P&L Table">
          {rows.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No posted activity in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${vulfMono.className} w-full min-w-[960px] text-sm`}>
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                    <Th label="Month" col="month" sticky />
                    <Th label="Net Revenue" col="revenue" right />
                    <Th label="COGS" col="cogs" right />
                    <Th label="Labor Costs" col="labor" right />
                    <Th label="Gross Profit" col="gross" right />
                    <Th label="OpEx" col="opex" right />
                    <Th label="EBITDA" col="ebitda" right />
                    <Th label="Depreciation" col="depreciation" right />
                    <Th label="Interest" col="interest" right />
                    <Th label="Net Income" col="net" right />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.period_month} className="group border-b border-black/5 hover:bg-neutral-50/60">
                      <td className="px-4 py-2.5 font-semibold text-neutral-800 sticky left-0 z-10 bg-white group-hover:bg-neutral-50">
                        {monthShort(r.period_month)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{fmtMoney0(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney0(r.cogs)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney0(r.labor)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.gross < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                        {fmtMoney0(r.gross)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney0(r.opex)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.ebitda < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                        {fmtMoney0(r.ebitda)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney0(r.depreciation)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney0(r.interest)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.net < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                        {fmtMoney0(r.net)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-black/15 bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-bold text-neutral-800 uppercase text-xs tracking-wide sticky left-0 z-10 bg-neutral-50">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-800">{fmtMoney0(totals.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{fmtMoney0(totals.cogs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{fmtMoney0(totals.labor)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${totals.gross < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                      {fmtMoney0(totals.gross)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{fmtMoney0(totals.opex)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${totals.ebitda < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                      {fmtMoney0(totals.ebitda)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{fmtMoney0(totals.depreciation)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{fmtMoney0(totals.interest)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${totals.net < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
                      {fmtMoney0(totals.net)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 py-3`}>
                Labor Costs = Payroll: Wages (6000) + Payroll: Employer Taxes (6010); labor is included in OpEx.
                Gross Profit = Net Revenue − COGS. Click a column header to sort; newest month first by default.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
