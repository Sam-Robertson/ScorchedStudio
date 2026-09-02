"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CostsResponse, useRangedReport, LoadingOrError, Section, KpiCard, MoneyTooltip,
  DataGapBanner, fmtMoney0, fmtAxisMoney, monthShort, AXIS_TICK, GRID_STROKE,
  CHART_COLORS, OTHER_COLOR,
} from "./shared";

const OTHER = "Other";
const MAX_SERIES = 9; // one per validated palette color; the rest fold into "Other"

export default function CostsView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<CostsResponse>("/api/admin/accounting/reports/costs", token, query);
  const [selected, setSelected] = useState<string | null>(null);

  // Rank every account that appears in the range by total spend; the top ones
  // get their own series/color, the rest fold into "Other" so the stacked chart
  // stays readable. The full account-level detail lives in Cost Details.
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

  // Pie: operating-expense accounts only (as the API's breakdown provides).
  // Accounts that fold into "Other" in the stacked chart fold here too, so the
  // click-to-isolate mapping between the two charts is one-to-one.
  const { pieData, pieTotal } = useMemo(() => {
    const majorSet = new Set(seriesNames);
    const slices: { name: string; value: number }[] = [];
    let other = 0;
    for (const b of data?.breakdown ?? []) {
      if (majorSet.has(b.name)) slices.push({ name: b.name, value: Math.round(b.amount * 100) / 100 });
      else other += b.amount;
    }
    if (other > 0) slices.push({ name: OTHER, value: Math.round(other * 100) / 100 });
    slices.sort((a, b) => (a.name === OTHER ? 1 : b.name === OTHER ? -1 : b.value - a.value));
    return { pieData: slices, pieTotal: slices.reduce((s, x) => s + x.value, 0) };
  }, [data, seriesNames]);

  function toggle(name: string) {
    setSelected((prev) => (prev === name ? null : name));
  }

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <DataGapBanner dataStartsAt={data?.dataStartsAt} />

      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Operating Costs" value={fmtMoney0(totals?.totalOperatingCosts ?? 0)} sub="excl. labor, COGS & interest" />
            <KpiCard label="Total Labor Costs" value={fmtMoney0(totals?.totalLaborCosts ?? 0)} sub="wages + employer taxes" />
            <KpiCard label="Total COGS" value={fmtMoney0(totals?.totalCogs ?? 0)} sub="materials & goods sold" />
          </div>

          <Section title="Operating Costs Breakdown">
            {pieData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No operating costs in this range.</p>
            ) : (
              <div className="px-6 py-6 grid md:grid-cols-[minmax(220px,300px)_1fr] gap-6 items-center">
                <div>
                  {pieData.map((slice) => {
                    const active = selected == null || selected === slice.name;
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
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(slice.name) }} />
                          <span className="text-neutral-700 truncate">
                            {slice.name === OTHER ? `Other (${otherMembers.length} accounts)` : slice.name}
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
                    Click an account to isolate it in the monthly chart below. Full account list in Cost Details.
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
                          fill={colorFor(slice.name)}
                          fillOpacity={selected == null || selected === slice.name ? 1 : 0.25}
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
              <button onClick={() => setSelected(null)}
                className={`${vulfMono.className} text-xs text-neutral-500 border border-black/15 rounded-lg px-3 py-1.5 hover:bg-neutral-50`}>
                Reset — showing {selected} only
              </button>
            ) : undefined}
          >
            {stackedData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No cost activity in this range.</p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stackedData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip showTotal />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    {seriesNames.map((name, i) => (
                      <Bar
                        key={name} dataKey={name} stackId="a" fill={colorFor(name)}
                        fillOpacity={selected == null || selected === name ? 1 : 0.12}
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
                        selected == null || selected === name ? "text-neutral-600" : "text-neutral-400 opacity-50"
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
        </>
      )}
    </div>
  );
}
