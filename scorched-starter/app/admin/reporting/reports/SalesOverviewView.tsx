"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  BarChart, Bar, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  SalesResponse, useRangedReport, LoadingOrError, Section, KpiCard, MoneyTooltip,
  DATA_STARTS_AT, fmtMoney0, fmtMoney2, fmtAxisMoney, dateShort,
  dowIndex, DOW_NAMES, AXIS_TICK, GRID_STROKE, BROWN, GREEN,
} from "./shared";
import { ChartTooltip } from "./bookingShared";
import SpDetailsView from "./SpDetailsView";

// Whole-tab switch between dollars and units sold. Every chart below reads
// the same figure either way, so it flips one metric rather than adding a
// parallel set of charts.
type Metric = "sales" | "count";

function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  return (
    <div className="flex rounded-lg border border-black/15 overflow-hidden self-start sm:self-auto">
      {([["sales", "Sales"], ["count", "Items sold"]] as [Metric, string][]).map(([m, label]) => (
        <button key={m} onClick={() => onChange(m)}
          className={`${vulfMono.className} px-4 py-1.5 text-xs transition-colors ${value === m ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function fmtCount(n: number) {
  return Math.round(n).toLocaleString();
}

export default function SalesOverviewView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<SalesResponse>("/api/admin/accounting/reports/sales", token, query);
  const [metric, setMetric] = useState<Metric>("sales");
  const isCount = metric === "count";
  const [selectedDow, setSelectedDow] = useState<number | null>(null);
  // Daily-detail disclosure: mounted lazily on first open, then kept mounted
  // (just hidden) so re-opening doesn't refetch.
  const [showDailyDetail, setShowDailyDetail] = useState(false);
  const [dailyDetailMounted, setDailyDetailMounted] = useState(false);

  const dataStartsAt = data?.dataStartsAt ?? DATA_STARTS_AT;

  // dataStartsAt is the first date with real per-day Square order data
  // (a few days after the 2025-07-28 grand opening) — filtering to it here
  // just drops the pre-opening zero-revenue days, not any real data.
  // (Recomputed from `daily` rather than using the API's own
  // revenueByDayOfWeek field so the two stay in lockstep with this filter.)
  const orderDays = useMemo(
    () => (data?.daily ?? []).filter((d) => d.date >= dataStartsAt),
    [data, dataStartsAt],
  );

  const netSalesOrderPeriod = useMemo(() => orderDays.reduce((s, d) => s + d.netSales, 0), [orderDays]);

  // dailyOrderStats only covers days that carry real Square orders, a
  // narrower set than `daily`, so count mode joins on date instead of
  // assuming the two arrays line up.
  const itemsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data?.dailyOrderStats ?? []) m.set(d.date, d.items);
    return m;
  }, [data]);

  const countDays = useMemo(
    () => (data?.dailyOrderStats ?? []).filter((d) => d.date >= dataStartsAt),
    [data, dataStartsAt],
  );

  const dowData = useMemo(() => {
    const sums = new Map<number, number>();
    const source = isCount
      ? countDays.map((d) => ({ date: d.date, value: d.items }))
      : orderDays.map((d) => ({ date: d.date, value: d.netSales }));
    for (const d of source) {
      const dow = dowIndex(d.date);
      sums.set(dow, (sums.get(dow) ?? 0) + d.value);
    }
    return [...sums.entries()]
      .map(([dow, value]) => ({ dow, day: DOW_NAMES[dow], value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [orderDays, countDays, isCount]);

  const seriesKey = isCount ? "Items Sold" : "Net Sales";

  const dailyData = useMemo(() => {
    const base = isCount ? countDays.map((d) => ({ date: d.date })) : orderDays.map((d) => ({ date: d.date }));
    const filtered = selectedDow == null ? base : base.filter((d) => dowIndex(d.date) === selectedDow);
    return filtered.map((d) => ({
      date: d.date,
      label: dateShort(d.date),
      [seriesKey]: isCount ? (itemsByDate.get(d.date) ?? 0) : (orderDays.find((o) => o.date === d.date)?.netSales ?? 0),
    }));
  }, [orderDays, countDays, itemsByDate, selectedDow, isCount, seriesKey]);

  const dailyAvg = useMemo(
    () => (dailyData.length ? dailyData.reduce((s, d) => s + (d[seriesKey] as number), 0) / dailyData.length : 0),
    [dailyData, seriesKey],
  );
  const dailyMax = useMemo(
    () => (dailyData.length ? Math.max(...dailyData.map((d) => d[seriesKey] as number)) : 0),
    [dailyData, seriesKey],
  );

  // The API returns a union of the top 15 by each metric, so the top 10 is
  // taken here against whichever one is showing.
  const topItems = useMemo(() => {
    const rows = [...(data?.topItems ?? [])];
    rows.sort((a, b) => (isCount ? b.quantity - a.quantity : b.revenue - a.revenue));
    return rows.slice(0, 10).map((t) => ({ name: t.name, [seriesKey]: isCount ? t.quantity : t.revenue }));
  }, [data, isCount, seriesKey]);

  const stats = data?.orderStats;

  return (
    <div className="space-y-6">
      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <>
          <div className="flex justify-end">
            <MetricToggle value={metric} onChange={setMetric} />
          </div>

          {/* KPI strip — order-level stats; no customer count exists in the data */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {isCount ? (
              <KpiCard label="Items Sold" value={fmtCount(stats?.totalItems ?? 0)}
                sub={`since ${dateShort(dataStartsAt)} (grand opening)`} />
            ) : (
              <KpiCard label="Net Sales" value={fmtMoney0(netSalesOrderPeriod)}
                sub={`since ${dateShort(dataStartsAt)} (grand opening)`} />
            )}
            <KpiCard label="Total Orders" value={(stats?.totalOrders ?? 0).toLocaleString()}
              sub={`${stats?.daysWithOrderData ?? 0} days with order data`} />
            <KpiCard label="Avg Order Value" value={fmtMoney2(stats?.avgOrderValue ?? 0)} />
            <KpiCard label="Avg Items per Order" value={(stats?.avgItemsPerOrder ?? 0).toFixed(1)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Section title={isCount ? "Top Items by Units Sold" : "Top Items by Revenue"}>
              {topItems.length === 0 ? (
                <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No order data in this range.</p>
              ) : (
                <div className="px-2 pt-6 pb-4">
                  <ResponsiveContainer width="100%" height={Math.max(220, topItems.length * 32)}>
                    <BarChart data={topItems} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false}
                        tickFormatter={isCount ? fmtCount : fmtAxisMoney} />
                      <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fill: "#6b7280" }} axisLine={false} tickLine={false} width={140} />
                      <Tooltip content={isCount ? <ChartTooltip /> : <MoneyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey={seriesKey} fill={BROWN} radius={[0, 3, 3, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 mt-1`}>
                    Top 10 Square line items by {isCount ? "units sold" : "revenue"}. Square items carry no category, so this replaces the old
                    &ldquo;Revenue by Category&rdquo; view.
                  </p>
                </div>
              )}
            </Section>

            <Section title={isCount ? "Items Sold by Day of Week" : "Revenue by Day of Week"}>
              {dowData.length === 0 ? (
                <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No order data in this range.</p>
              ) : (
                <div className="px-2 pt-6 pb-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dowData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false}
                        tickFormatter={(d: string) => d.slice(0, 3)} interval={0} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52}
                        tickFormatter={isCount ? fmtCount : fmtAxisMoney} />
                      <Tooltip content={isCount ? <ChartTooltip /> : <MoneyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar
                        dataKey="value" name={seriesKey} radius={[3, 3, 0, 0]} maxBarSize={48}
                        onClick={(entry) => {
                          const e = entry as { dow?: number; payload?: { dow?: number } };
                          const dow = typeof e?.dow === "number" ? e.dow : e?.payload?.dow;
                          if (typeof dow === "number") setSelectedDow((prev) => (prev === dow ? null : dow));
                        }}
                        className="cursor-pointer"
                      >
                        {dowData.map((d) => (
                          <Cell
                            key={d.dow}
                            fill={selectedDow === d.dow ? BROWN : GREEN}
                            fillOpacity={selectedDow == null || selectedDow === d.dow ? 1 : 0.25}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1`}>
                    {selectedDow == null
                      ? "Order days only (backfill months excluded). Click a bar to filter the daily chart below."
                      : `Filtering the daily chart to ${DOW_NAMES[selectedDow]}s. Click the bar again to reset.`}
                  </p>
                </div>
              )}
            </Section>
          </div>

          <Section
            title={`Daily ${isCount ? "Items Sold" : "Revenue"}${selectedDow == null ? "" : ` (${DOW_NAMES[selectedDow]}s only)`}`}
            action={selectedDow != null ? (
              <button onClick={() => setSelectedDow(null)}
                className={`${vulfMono.className} text-xs text-neutral-500 border border-black/15 rounded-lg px-3 py-1.5 hover:bg-neutral-50`}>
                Reset filter
              </button>
            ) : undefined}
          >
            {dailyData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No order data in this range.</p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                <ResponsiveContainer width="100%" height={280}>
                  {selectedDow == null ? (
                    <AreaChart data={dailyData} margin={{ top: 8, right: 72, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={40} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52}
                        tickFormatter={isCount ? fmtCount : fmtAxisMoney} />
                      <Tooltip content={isCount ? <ChartTooltip /> : <MoneyTooltip />} />
                      <ReferenceLine y={dailyAvg} stroke={BROWN} strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: `Avg ${isCount ? fmtCount(dailyAvg) : fmtMoney0(dailyAvg)}`, position: "right", fontSize: 10, fill: BROWN, fontFamily: "var(--font-display,monospace)" }} />
                      <ReferenceLine y={dailyMax} stroke="#9ca3af" strokeDasharray="2 4" strokeWidth={1}
                        label={{ value: `Max ${isCount ? fmtCount(dailyMax) : fmtMoney0(dailyMax)}`, position: "right", fontSize: 10, fill: "#9ca3af", fontFamily: "var(--font-display,monospace)" }} />
                      <Area type="monotone" dataKey={seriesKey} stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  ) : (
                    <LineChart data={dailyData} margin={{ top: 8, right: 72, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={40} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52}
                        tickFormatter={isCount ? fmtCount : fmtAxisMoney} />
                      <Tooltip content={isCount ? <ChartTooltip /> : <MoneyTooltip />} />
                      <ReferenceLine y={dailyAvg} stroke={BROWN} strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: `Avg ${isCount ? fmtCount(dailyAvg) : fmtMoney0(dailyAvg)}`, position: "right", fontSize: 10, fill: BROWN, fontFamily: "var(--font-display,monospace)" }} />
                      <Line type="monotone" dataKey={seriesKey} stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          {/* Opt-in compact daily table: the last 15 days of order data by
              default (its own fixed recent window, independent of the
              page-wide date-range selector), with a jump-to-date control. */}
          <div>
            <button
              onClick={() => { setShowDailyDetail((v) => !v); setDailyDetailMounted(true); }}
              className={`${vulfMono.className} text-xs text-neutral-500 border border-black/15 rounded-lg px-3 py-1.5 hover:bg-neutral-50`}
              aria-expanded={showDailyDetail}
            >
              {showDailyDetail ? "Hide daily detail" : "Show daily detail (last 15 days)"}
            </button>
          </div>
          {dailyDetailMounted && (
            <div className={showDailyDetail ? "" : "hidden"}>
              <SpDetailsView token={token} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
