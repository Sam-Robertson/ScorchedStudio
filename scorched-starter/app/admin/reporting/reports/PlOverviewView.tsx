"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  PlResponse, useRangedReport, LoadingOrError, mergePlMonths, sumLinesByMonth,
  dropEmptyTrailingMonths, Section, KpiCard, MoneyTooltip,
  fmtMoney0, fmtPct1, fmtAxisMoney, monthShort, monthTick, AXIS_TICK, GRID_STROKE,
  BROWN, GREEN, BLUE,
} from "./shared";

const LABOR_CODES = ["6000", "6010"]; // Payroll: Wages + Payroll: Employer Taxes

const RED = "#C25B5B"; // same soft red used for negative Net Profit below

type KpiKey = "revenue" | "profit" | "cogs" | "opex";
type SeasonalityRow = { period_month: string; revenue: number; ttm_avg: number | null; index: number | null };

export default function PlOverviewView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<PlResponse>("/api/admin/accounting/reports/pl", token, query);
  // Deliberately unranged (query ""): the seasonality index needs full history
  // for its trailing-12-month average, regardless of the page's date range.
  const { data: seasonality } = useRangedReport<{ rows: SeasonalityRow[] }>(
    "/api/admin/accounting/reports/seasonality", token, "",
  );
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);

  // Most recent *complete* month with a computable index — the one-line
  // takeaway that used to be buried at the bottom of the Seasonality tab.
  // Excludes the current in-progress calendar month: a partial month's
  // revenue compared against a full-month trailing average always reads as
  // dramatically "below average" early in the month, which is misleading
  // rather than useful (e.g. "99% below" on the 2nd of the month).
  const seasonalityNow = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const rows = [...(seasonality?.rows ?? [])]
      .filter((r) => r.index != null && r.period_month.slice(0, 7) !== currentMonth)
      .sort((a, b) => a.period_month.localeCompare(b.period_month));
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }, [seasonality]);
  const seasonalityPct = seasonalityNow ? Math.round((seasonalityNow.index! - 1) * 100) : null;

  const months = useMemo(() => dropEmptyTrailingMonths(mergePlMonths(data?.months ?? [])), [data]);
  const laborByMonth = useMemo(() => sumLinesByMonth(data?.lines ?? [], LABOR_CODES), [data]);

  const totals = useMemo(() => {
    const revenue = months.reduce((s, m) => s + m.revenue, 0);
    const netIncome = months.reduce((s, m) => s + m.net_income, 0);
    const cogs = months.reduce((s, m) => s + m.cogs, 0);
    const opex = months.reduce((s, m) => s + m.operating_expenses, 0);
    return { revenue, netIncome, cogs, opex };
  }, [months]);

  const revProfitData = useMemo(
    () => months.map((m) => ({
      label: monthShort(m.period_month),
      "Net Revenue": Math.round(m.revenue * 100) / 100,
      "Gross Profit": Math.round(m.gross_profit * 100) / 100,
      "Net Profit": Math.round(m.net_income * 100) / 100,
    })),
    [months],
  );

  const costStructureData = useMemo(
    () => months.map((m) => {
      const labor = laborByMonth.get(m.period_month) ?? 0;
      return {
        label: monthShort(m.period_month),
        COGS: Math.round(m.cogs * 100) / 100,
        Labor: Math.round(labor * 100) / 100,
        "Other OpEx": Math.round((m.operating_expenses - labor) * 100) / 100,
      };
    }),
    [months, laborByMonth],
  );

  function toggleKpi(k: KpiKey) {
    setSelectedKpi((prev) => (prev === k ? null : k));
  }

  // Line emphasis for the Revenue vs Profit chart (revenue / profit cards).
  // "profit" isolates Net Profit (net income) — the figure the KPI card
  // actually shows — not Gross Profit, which has no card of its own.
  const lineOpacity = (line: "revenue" | "grossProfit" | "netProfit") => {
    if (selectedKpi !== "revenue" && selectedKpi !== "profit") return 1;
    if (selectedKpi === "revenue") return line === "revenue" ? 1 : 0.15;
    return line === "netProfit" ? 1 : 0.15;
  };
  // Segment emphasis for the Cost Structure chart (cogs / opex cards).
  const segOpacity = (seg: "COGS" | "Labor" | "Other OpEx") => {
    if (selectedKpi !== "cogs" && selectedKpi !== "opex") return 1;
    if (selectedKpi === "cogs") return seg === "COGS" ? 1 : 0.2;
    return seg === "COGS" ? 0.2 : 1;
  };

  const pctSub = totals.revenue > 0 ? undefined : "no revenue in range";

  return (
    <div className="space-y-6">
      {/* KPI cards — click to isolate the matching series below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Net Revenue" value={fmtMoney0(totals.revenue)} sub="click to isolate line"
          onClick={() => toggleKpi("revenue")} selected={selectedKpi === "revenue"}
        />
        <KpiCard
          label="Net Profit" value={fmtMoney0(totals.netIncome)} sub="click to isolate line"
          valueColor={totals.netIncome < 0 ? "#C25B5B" : "#418A5C"}
          onClick={() => toggleKpi("profit")} selected={selectedKpi === "profit"}
        />
        <KpiCard
          label="COGS % of Revenue"
          value={totals.revenue > 0 ? fmtPct1(totals.cogs / totals.revenue) : "—"}
          sub={pctSub ?? "click to highlight COGS"}
          onClick={() => toggleKpi("cogs")} selected={selectedKpi === "cogs"}
        />
        <KpiCard
          label="Operating Cost % of Revenue"
          value={totals.revenue > 0 ? fmtPct1(totals.opex / totals.revenue) : "—"}
          sub={pctSub ?? "click to highlight OpEx"}
          onClick={() => toggleKpi("opex")} selected={selectedKpi === "opex"}
        />
      </div>

      {/* Seasonality callout — one line, full-history TTM index for the current month */}
      {seasonalityNow && seasonalityPct != null && (
        <p className={`${vulfMono.className} text-xs text-neutral-500`}>
          Seasonality: {monthShort(seasonalityNow.period_month)} revenue is running{" "}
          {seasonalityPct === 0 ? (
            <span className="font-semibold text-neutral-600">in line with</span>
          ) : (
            <span className="font-semibold" style={{ color: seasonalityPct > 0 ? GREEN : RED }}>
              {Math.abs(seasonalityPct)}% {seasonalityPct > 0 ? "above" : "below"}
            </span>
          )}{" "}
          its 12-month average.
        </p>
      )}

      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <div className="grid lg:grid-cols-2 gap-6">
          <Section title="Revenue vs Profit by Month">
            {revProfitData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No posted activity in this range.</p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revProfitData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={monthTick} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ fontFamily: "var(--font-display,monospace)", fontSize: 12 }} iconType="plainline" />
                    <Line type="monotone" dataKey="Net Revenue" stroke={GREEN} strokeWidth={2}
                      strokeOpacity={lineOpacity("revenue")} dot={{ r: 2, fill: GREEN, opacity: lineOpacity("revenue") }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Gross Profit" stroke={BROWN} strokeWidth={2}
                      strokeOpacity={lineOpacity("grossProfit")} dot={{ r: 2, fill: BROWN, opacity: lineOpacity("grossProfit") }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Net Profit" stroke={BLUE} strokeWidth={2}
                      strokeOpacity={lineOpacity("netProfit")} dot={{ r: 2, fill: BLUE, opacity: lineOpacity("netProfit") }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
                {(selectedKpi === "revenue" || selectedKpi === "profit") && (
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1`}>
                    Isolating {selectedKpi === "revenue" ? "Net Revenue" : "profit"} — click the card again to reset.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section title="Cost Structure by Month">
            {costStructureData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No posted activity in this range.</p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={costStructureData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={monthTick} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip showTotal />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Legend wrapperStyle={{ fontFamily: "var(--font-display,monospace)", fontSize: 12 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="COGS" stackId="a" fill={BROWN} fillOpacity={segOpacity("COGS")} stroke="#fff" strokeWidth={1} maxBarSize={48} />
                    <Bar dataKey="Labor" stackId="a" fill={GREEN} fillOpacity={segOpacity("Labor")} stroke="#fff" strokeWidth={1} maxBarSize={48} />
                    <Bar dataKey="Other OpEx" stackId="a" fill={BLUE} fillOpacity={segOpacity("Other OpEx")} stroke="#fff" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
                {(selectedKpi === "cogs" || selectedKpi === "opex") && (
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1`}>
                    Highlighting {selectedKpi === "cogs" ? "COGS" : "operating costs (labor + other OpEx)"} — click the card again to reset.
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
