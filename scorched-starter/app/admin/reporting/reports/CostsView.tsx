"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  CostsResponse, useRangedReport, LoadingOrError, Section, KpiCard, MoneyTooltip,
  JournalDrillDown, fmtMoney0, fmtAxisMoney, fmtPct1, monthShort, monthTick,
  AXIS_TICK, GRID_STROKE, CHART_COLORS, OTHER_COLOR, GREEN,
} from "./shared";

const OTHER = "Other";
const MAX_SERIES = 9; // one per validated palette color; the rest fold into "Other"

// Synthetic donut slice so the donut and the stacked chart below agree on
// what's included — the stacked chart has always shown labor, the donut
// (built from the opex-only breakdown) didn't. Fixed addition, not part of
// the MAX_SERIES rank/fold logic.
const LABOR_SLICE = "Labor";
const LABOR_CODES = ["6000", "6010"];
// Account names for the labor codes as seeded in supabase-accounting-setup.sql;
// used to keep the Labor donut slice and the payroll series in the stacked
// chart pointing at each other when one is isolated.
const LABOR_NAME_TO_CODE: Record<string, string> = {
  "Payroll: Wages": "6000",
  "Payroll: Employer Taxes": "6010",
};
const LABOR_SERIES_NAMES = new Set(Object.keys(LABOR_NAME_TO_CODE));

type SortCol = "name" | "amount" | "pct";
type SortDir = "desc" | "asc";

export default function CostsView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<CostsResponse>("/api/admin/accounting/reports/costs", token, query);
  const [selected, setSelected] = useState<string | null>(null);
  const [showCharges, setShowCharges] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Rank every account that appears in the range by total spend; the top ones
  // get their own series/color, the rest fold into "Other" so the stacked chart
  // stays readable. The full account-level detail lives in the table below.
  const { seriesNames, colorFor, stackedData, otherMembers } = useMemo(() => {
    const totalsByName = new Map<string, number>();
    for (const row of data?.monthlyCategories ?? []) {
      for (const [key, val] of Object.entries(row)) {
        if (key === "period_month" || typeof val !== "number") continue;
        totalsByName.set(key, (totalsByName.get(key) ?? 0) + val);
      }
    }
    const ranked = [...totalsByName.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const majors = ranked.slice(0, MAX_SERIES);
    const minors = ranked.slice(MAX_SERIES);
    const minorSet = new Set(minors);

    const colors = new Map<string, string>();
    majors.forEach((name, i) => colors.set(name, CHART_COLORS[i]));
    colors.set(OTHER, OTHER_COLOR);

    const stacked = (data?.monthlyCategories ?? []).map((row) => {
      const out: Record<string, number | string> = { label: monthShort(String(row.period_month)) };
      let other = 0;
      for (const [key, val] of Object.entries(row)) {
        if (key === "period_month" || typeof val !== "number") continue;
        if (minorSet.has(key)) other += val;
        else out[key] = Math.round(val * 100) / 100;
      }
      if (minors.length > 0) out[OTHER] = Math.round(other * 100) / 100;
      return out;
    });

    const names = minors.length > 0 ? [...majors, OTHER] : majors;
    return {
      seriesNames: names,
      colorFor: (name: string) => colors.get(name) ?? OTHER_COLOR,
      stackedData: stacked,
      otherMembers: minors,
    };
  }, [data]);

  // Pie: operating-expense accounts (as the API's breakdown provides) plus a
  // synthetic Labor slice, so the donut agrees with the stacked chart below on
  // what's included. Accounts that fold into "Other" in the stacked chart fold
  // here too, so the click-to-isolate mapping between the two charts is
  // one-to-one.
  const { pieData, pieTotal } = useMemo(() => {
    const majorSet = new Set(seriesNames);
    const slices: { name: string; value: number }[] = [];
    let other = 0;
    for (const b of data?.breakdown ?? []) {
      if (majorSet.has(b.name)) slices.push({ name: b.name, value: Math.round(b.amount * 100) / 100 });
      else other += b.amount;
    }
    const laborTotal = data?.totals.totalLaborCosts ?? 0;
    if (laborTotal > 0) slices.push({ name: LABOR_SLICE, value: Math.round(laborTotal * 100) / 100 });
    if (other > 0) slices.push({ name: OTHER, value: Math.round(other * 100) / 100 });
    slices.sort((a, b) => (a.name === OTHER ? 1 : b.name === OTHER ? -1 : b.value - a.value));
    return { pieData: slices, pieTotal: slices.reduce((s, x) => s + x.value, 0) };
  }, [data, seriesNames]);

  // Donut colors: the synthetic Labor slice always gets the same green used
  // for Labor elsewhere (e.g. the P&L cost-structure chart); everything else
  // keeps its rank-assigned color from the stacked chart.
  const sliceColor = (name: string) => (name === LABOR_SLICE ? GREEN : colorFor(name));

  // Does `name` light up while `sel` is isolated? The Labor donut slice and
  // the individual payroll series in the stacked chart map onto each other.
  function matchesSelection(name: string, sel: string) {
    if (name === sel) return true;
    if (name === LABOR_SLICE && LABOR_SERIES_NAMES.has(sel)) return true;
    if (sel === LABOR_SLICE && LABOR_SERIES_NAMES.has(name)) return true;
    return false;
  }

  function toggle(name: string) {
    setShowCharges(false);
    setSelected((prev) => (prev === name ? null : name));
  }

  // Account codes behind the isolated slice/series, for the charges drill-down.
  const nameToCode = useMemo(
    () => new Map((data?.breakdown ?? []).map((b) => [b.name, b.code] as const)),
    [data],
  );
  const selectedCodes = useMemo<string[]>(() => {
    if (!selected) return [];
    if (selected === LABOR_SLICE) return LABOR_CODES;
    if (LABOR_NAME_TO_CODE[selected]) return [LABOR_NAME_TO_CODE[selected]];
    if (selected === OTHER) return otherMembers.map((n) => nameToCode.get(n)).filter((c): c is string => !!c);
    const code = nameToCode.get(selected);
    return code ? [code] : [];
  }, [selected, nameToCode, otherMembers]);

  // The page's selected range, for the charges drill-down window.
  const rangeParams = useMemo(() => {
    const params = new URLSearchParams(query);
    return { from: params.get("start") ?? undefined, to: params.get("end") ?? undefined };
  }, [query]);

  const totals = data?.totals;

  // ── Labor trend + account-level table (merged in from the old Cost Details tab)

  const laborData = useMemo(
    () => (data?.laborByMonth ?? []).map((m) => ({
      label: monthShort(m.period_month),
      Labor: Math.round(m.amount * 100) / 100,
    })),
    [data],
  );

  const totalOpex = data?.totals.totalOperatingCosts ?? 0;

  const accountRows = useMemo(() => {
    const out = (data?.breakdown ?? []).map((b) => ({
      code: b.code,
      name: b.name,
      amount: b.amount,
      pct: totalOpex > 0 ? b.amount / totalOpex : 0,
    }));
    out.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.amount - b.amount; // pct sorts identically to amount
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out;
  }, [data, totalOpex, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir(col === "name" ? "asc" : "desc"); }
  }

  const Th = ({ label, col, right }: { label: string; col: SortCol; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-4 pb-3 pt-4 font-medium whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 ${right ? "text-right" : ""} ${sortCol === col ? "text-neutral-700" : ""}`}
    >
      {label}{sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Operating Costs" value={fmtMoney0(totals?.totalOperatingCosts ?? 0)} sub="excl. labor, COGS & interest" />
            <KpiCard label="Total Labor Costs" value={fmtMoney0(totals?.totalLaborCosts ?? 0)} sub="wages + employer taxes" />
            <KpiCard label="Total COGS" value={fmtMoney0(totals?.totalCogs ?? 0)} sub="materials & goods sold" />
          </div>

          <Section title="Costs Breakdown">
            {pieData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No costs in this range.</p>
            ) : (
              <div className="px-6 py-6 grid md:grid-cols-[minmax(220px,300px)_1fr] gap-6 items-center">
                <div>
                  {pieData.map((slice) => {
                    const active = selected == null || matchesSelection(slice.name, selected);
                    return (
                      <button
                        key={slice.name}
                        onClick={() => toggle(slice.name)}
                        className={`${vulfMono.className} w-full flex items-center justify-between gap-3 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
                          selected === slice.name ? "bg-[#884A20]/[0.07] ring-1 ring-[#884A20]/30" : "hover:bg-neutral-50"
                        } ${active ? "" : "opacity-40"}`}
                        aria-pressed={selected === slice.name}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sliceColor(slice.name) }} />
                          <span className="text-neutral-700 truncate">
                            {slice.name === OTHER ? `Other (${otherMembers.length} accounts)`
                              : slice.name === LABOR_SLICE ? "Labor (wages + employer taxes)"
                              : slice.name}
                          </span>
                        </span>
                        <span className="tabular-nums text-neutral-500 shrink-0">{fmtMoney0(slice.value)}</span>
                      </button>
                    );
                  })}
                  <div className={`${vulfMono.className} flex items-center justify-between text-xs font-bold border-t border-black/10 mt-2 pt-2 px-2.5 text-neutral-800`}>
                    <span>Total</span>
                    <span className="tabular-nums">{fmtMoney0(pieTotal)}</span>
                  </div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mt-3 px-2.5`}>
                    Operating expenses plus labor (COGS excluded), matching the monthly chart below. Click an account to
                    isolate it in that chart. Full account list in the table at the bottom of this page.
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Tooltip content={<MoneyTooltip />} />
                    <Pie
                      data={pieData} dataKey="value" nameKey="name"
                      innerRadius="45%" outerRadius="90%" paddingAngle={1.5} strokeWidth={2} stroke="#fff"
                      onClick={(entry) => {
                        const name = (entry as { name?: string })?.name;
                        if (name) toggle(name);
                      }}
                      className="cursor-pointer"
                    >
                      {pieData.map((slice) => (
                        <Cell
                          key={slice.name}
                          fill={sliceColor(slice.name)}
                          fillOpacity={selected == null || matchesSelection(slice.name, selected) ? 1 : 0.25}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section
            title="Cost Categories by Month"
            action={selected != null ? (
              <div className="flex items-center gap-2">
                {selectedCodes.length > 0 && (
                  <button onClick={() => setShowCharges((v) => !v)}
                    className={`${vulfMono.className} text-xs rounded-lg px-3 py-1.5 border transition-colors ${
                      showCharges
                        ? "bg-[#884A20] text-white border-transparent"
                        : "text-neutral-500 border-black/15 hover:bg-neutral-50"
                    }`}
                    aria-expanded={showCharges}>
                    {showCharges ? "Hide charges" : "View charges"}
                  </button>
                )}
                <button onClick={() => { setSelected(null); setShowCharges(false); }}
                  className={`${vulfMono.className} text-xs text-neutral-500 border border-black/15 rounded-lg px-3 py-1.5 hover:bg-neutral-50`}>
                  Reset — showing {selected} only
                </button>
              </div>
            ) : undefined}
          >
            {stackedData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No cost activity in this range.</p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stackedData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={monthTick} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip showTotal />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    {seriesNames.map((name, i) => (
                      <Bar
                        key={name} dataKey={name} stackId="a" fill={colorFor(name)}
                        fillOpacity={selected == null || matchesSelection(name, selected) ? 1 : 0.12}
                        stroke="#fff" strokeWidth={1}
                        radius={i === seriesNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={48}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 mt-2">
                  {seriesNames.map((name) => (
                    <button key={name} onClick={() => toggle(name)}
                      className={`${vulfMono.className} flex items-center gap-1.5 text-[11px] transition-opacity ${
                        selected == null || matchesSelection(name, selected) ? "text-neutral-600" : "text-neutral-400 opacity-50"
                      }`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorFor(name) }} />
                      {name}
                    </button>
                  ))}
                </div>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 mt-2`}>
                  Includes COGS and labor alongside operating expenses, matching the old Domo chart.
                  {otherMembers.length > 0 && ` "Other" groups: ${otherMembers.join(", ")}.`}
                </p>
              </div>
            )}
          </Section>

          {/* Transaction-level drill-down for the isolated slice */}
          {selected != null && showCharges && selectedCodes.length > 0 && (
            <Section title={`Charges — ${selected}`}>
              <div className="px-4 py-3">
                <JournalDrillDown
                  token={token}
                  from={rangeParams.from}
                  to={rangeParams.to}
                  accountCodes={selectedCodes}
                />
              </div>
            </Section>
          )}

          <Section title="Labor Costs by Month">
            {laborData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No labor costs in this range.</p>
            ) : (
              <div className="px-2 pt-8 pb-4">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={laborData} margin={{ top: 20, right: 40, left: 12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" padding={{ left: 16, right: 16 }} tickFormatter={monthTick} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Area type="monotone" dataKey="Labor" stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.12}
                      dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }}>
                      <LabelList
                        dataKey="Labor"
                        position="top"
                        offset={10}
                        formatter={(v: unknown) => fmtMoney0(Number(v))}
                        style={{ fontFamily: "var(--font-display,monospace)", fontSize: 10, fill: "#6b7280" }}
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 mt-1`}>
                  Payroll wages + employer taxes per month.
                </p>
              </div>
            )}
          </Section>

          <Section title="Operating Cost Accounts">
            {accountRows.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No operating costs in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`${vulfMono.className} w-full min-w-[560px] text-sm`}>
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                      <Th label="Account" col="name" />
                      <Th label="Amount" col="amount" right />
                      <Th label="% of Operating Costs" col="pct" right />
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((r) => (
                      <tr key={r.code} className="border-b border-black/5 hover:bg-neutral-50/60">
                        <td className="px-4 py-2.5 text-neutral-800">
                          <span className="text-neutral-400 mr-2">{r.code}</span>{r.name}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{fmtMoney0(r.amount)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="hidden sm:block w-20 h-1.5 rounded-full bg-black/5 overflow-hidden">
                              <div className="h-full rounded-full bg-[#884A20]" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-neutral-500 w-12 text-right">{fmtPct1(r.pct)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-black/15 bg-neutral-50/60">
                      <td className="px-4 py-2.5 font-bold text-neutral-800 uppercase text-xs tracking-wide">Total operating costs</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-800">{fmtMoney0(totalOpex)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-500">100%</td>
                    </tr>
                  </tbody>
                </table>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 py-3`}>
                  Operating-expense accounts only — labor, COGS, depreciation, and interest are excluded
                  (see the totals at the top of this page for those).
                </p>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
