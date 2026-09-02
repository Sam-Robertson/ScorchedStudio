"use client";

import { Fragment, useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  PlResponse, PlLine, useRangedReport, LoadingOrError, mergePlMonths, sumLinesByMonth,
  dropEmptyTrailingMonths, Section, JournalDrillDown, fmtMoney0, monthShort,
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

// Columns backed by a natural account grouping — clickable for drill-down.
// Gross Profit / EBITDA / Net Income are formulas, so they aren't drillable.
type DrillCol = "revenue" | "cogs" | "labor" | "opex" | "depreciation" | "interest";

const DRILL_LABEL: Record<DrillCol, string> = {
  revenue: "Net Revenue",
  cogs: "COGS",
  labor: "Labor Costs",
  opex: "OpEx",
  depreciation: "Depreciation",
  interest: "Interest",
};

// Mirrors v_pl_monthly's column definitions (supabase-accounting-reports-setup.sql):
// revenue = type 'revenue'; cogs = type 'cogs'; labor = codes 6000/6010;
// opex = type 'expense' excluding 7000/8000 (labor is a subset of opex by
// design); depreciation = 7000; interest = 8000.
function lineMatchesCol(line: PlLine, col: DrillCol): boolean {
  switch (col) {
    case "revenue": return line.type === "revenue";
    case "cogs": return line.type === "cogs";
    case "labor": return LABOR_CODES.includes(line.code);
    case "opex": return line.type === "expense" && line.code !== "7000" && line.code !== "8000";
    case "depreciation": return line.code === "7000";
    case "interest": return line.code === "8000";
  }
}

/** Last day of the month for a "YYYY-MM-01" period. */
function monthEnd(period_month: string) {
  const [y, m] = period_month.slice(0, 10).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${period_month.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export default function PlDetailsView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<PlResponse>("/api/admin/accounting/reports/pl", token, query);
  const [sortCol, setSortCol] = useState<SortCol>("month");
  // Chronological by default — the most recent month sits directly above the
  // Total row at the bottom.
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // First drill level: which (month, column) cell is expanded.
  const [drill, setDrill] = useState<{ month: string; col: DrillCol } | null>(null);
  // Second drill level: which account code inside the panel shows transactions.
  const [drillAccount, setDrillAccount] = useState<string | null>(null);

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

  // Account lines rolling into the currently expanded cell, biggest first.
  const drillLines = useMemo(() => {
    if (!drill) return [];
    return (data?.lines ?? [])
      .filter((l) => l.period_month === drill.month && lineMatchesCol(l, drill.col))
      .sort((a, b) => b.amount - a.amount);
  }, [data, drill]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  function toggleDrill(month: string, col: DrillCol) {
    setDrillAccount(null);
    setDrill((prev) => (prev && prev.month === month && prev.col === col ? null : { month, col }));
  }

  const Th = ({ label, col, right, sticky }: { label: string; col: SortCol; right?: boolean; sticky?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-4 pb-3 pt-4 font-medium whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 ${right ? "text-right" : ""} ${sortCol === col ? "text-neutral-700" : ""} ${sticky ? "sticky left-0 z-10 bg-white" : ""}`}
    >
      {label}{sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  // A drillable money cell — clicking expands the account breakdown below its
  // row. Plain render functions (not components): defining components inline
  // would give them a new identity every render and remount the drill-down
  // fetch on each state change.
  function drillCell(row: Row, col: DrillCol, className: string) {
    const active = drill?.month === row.period_month && drill?.col === col;
    return (
      <td className={`px-4 py-2.5 text-right tabular-nums ${className}`}>
        <button
          onClick={() => toggleDrill(row.period_month, col)}
          className={`underline decoration-dotted underline-offset-4 cursor-pointer hover:text-[#884A20] transition-colors ${
            active ? "text-[#884A20] font-semibold" : "decoration-black/20"
          }`}
          title={`Break down ${DRILL_LABEL[col]} for ${monthShort(row.period_month)}`}
        >
          {fmtMoney0(row[col])}
        </button>
      </td>
    );
  }

  return (
    <div className="space-y-6">
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
                  {rows.map((r) => renderRowGroup(r))}
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
                Gross Profit = Net Revenue − COGS. Click a column header to sort; oldest month first by default.
                Click a dollar amount (except the computed Gross Profit / EBITDA / Net Income columns) to see the
                accounts behind it, then click an account for its transactions.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  );

  // One month row plus, when expanded, its inline drill-down panel row.
  function renderRowGroup(r: Row) {
    const expanded = drill?.month === r.period_month;
    return (
      <Fragment key={r.period_month}>
        <tr className="group border-b border-black/5 hover:bg-neutral-50/60">
          <td className="px-4 py-2.5 font-semibold text-neutral-800 sticky left-0 z-10 bg-white group-hover:bg-neutral-50">
            {monthShort(r.period_month)}
          </td>
          {drillCell(r, "revenue", "text-neutral-700")}
          {drillCell(r, "cogs", "text-neutral-600")}
          {drillCell(r, "labor", "text-neutral-600")}
          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.gross < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
            {fmtMoney0(r.gross)}
          </td>
          {drillCell(r, "opex", "text-neutral-600")}
          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.ebitda < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
            {fmtMoney0(r.ebitda)}
          </td>
          {drillCell(r, "depreciation", "text-neutral-600")}
          {drillCell(r, "interest", "text-neutral-600")}
          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.net < 0 ? "text-[#C25B5B]" : "text-neutral-800"}`}>
            {fmtMoney0(r.net)}
          </td>
        </tr>
        {expanded && drill && (
          <tr className="border-b border-black/5">
            <td colSpan={10} className="px-4 py-4 bg-neutral-50/60">
              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>
                    {DRILL_LABEL[drill.col]} — {monthShort(r.period_month)}
                  </p>
                  <button
                    onClick={() => { setDrill(null); setDrillAccount(null); }}
                    className={`${vulfMono.className} text-xs text-neutral-400 hover:text-neutral-600`}
                  >
                    Close
                  </button>
                </div>
                {drillLines.length === 0 ? (
                  <p className={`${vulfMono.className} text-xs text-neutral-400 py-2`}>No account activity for this cell.</p>
                ) : (
                  <div className="space-y-1">
                    {drillLines.map((l) => {
                      const open = drillAccount === l.code;
                      return (
                        <div key={l.code}>
                          <button
                            onClick={() => setDrillAccount((prev) => (prev === l.code ? null : l.code))}
                            className={`${vulfMono.className} w-full flex items-center justify-between gap-3 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
                              open ? "bg-[#884A20]/[0.07] ring-1 ring-[#884A20]/30" : "hover:bg-neutral-50"
                            }`}
                            aria-expanded={open}
                          >
                            <span className="text-neutral-700 text-left">
                              <span className="text-neutral-400 mr-2">{l.code}</span>{l.name}
                            </span>
                            <span className="tabular-nums text-neutral-600 shrink-0 font-medium">{fmtMoney0(l.amount)}</span>
                          </button>
                          {open && (
                            <div className="ml-2 my-2 rounded-lg border border-black/8 bg-neutral-50/40 px-2 py-1">
                              <JournalDrillDown
                                token={token}
                                from={r.period_month.slice(0, 10)}
                                to={monthEnd(r.period_month)}
                                accountCodes={[l.code]}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <p className={`${vulfMono.className} text-[10px] text-neutral-400 pt-2 px-2.5`}>
                      Every account that rolled into this cell, biggest first. Click an account to see its transactions for the month.
                    </p>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }
}
