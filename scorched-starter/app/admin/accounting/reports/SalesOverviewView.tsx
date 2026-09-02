"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  BarChart, Bar, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  SalesResponse, useRangedReport, LoadingOrError, Section, KpiCard, MoneyTooltip,
  DataGapBanner, DATA_STARTS_AT, fmtMoney0, fmtMoney2, fmtAxisMoney, dateShort,
  dowIndex, DOW_NAMES, AXIS_TICK, GRID_STROKE, BROWN, GREEN,
} from "./shared";

export default function SalesOverviewView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<SalesResponse>("/api/admin/accounting/reports/sales", token, query);
  const [selectedDow, setSelectedDow] = useState<number | null>(null);

  const dataStartsAt = data?.dataStartsAt ?? DATA_STARTS_AT;

  // The Jan–May CSV backfill posts each month's revenue as a single entry dated
  // the 1st of the month. Those are not real daily figures, so both the daily
  // chart and the day-of-week breakdown only use dates from dataStartsAt on.
  // (The API's own revenueByDayOfWeek field includes the backfill lumps, so we
  // recompute day-of-week here from the honest daily set instead.)
  const orderDays = useMemo(
    () => (data?.daily ?? []).filter((d) => d.date >= dataStartsAt),
    [data, dataStartsAt],
  );

  const netSalesOrderPeriod = useMemo(() => orderDays.reduce((s, d) => s + d.netSales, 0), [orderDays]);

  const dowData = useMemo(() => {
    const sums = new Map<number, number>();
    for (const d of orderDays) {
      const dow = dowIndex(d.date);
      sums.set(dow, (sums.get(dow) ?? 0) + d.netSales);
    }
    return [...sums.entries()]
      .map(([dow, revenue]) => ({ dow, day: DOW_NAMES[dow], revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orderDays]);

  const dailyData = useMemo(() => {
    const filtered = selectedDow == null ? orderDays : orderDays.filter((d) => dowIndex(d.date) === selectedDow);
    return filtered.map((d) => ({ date: d.date, label: dateShort(d.date), "Net Sales": d.netSales }));
  }, [orderDays, selectedDow]);

  const dailyAvg = useMemo(
    () => (dailyData.length ? dailyData.reduce((s, d) => s + d["Net Sales"], 0) / dailyData.length : 0),
    [dailyData],
  );
  const dailyMax = useMemo(
    () => (dailyData.length ? Math.max(...dailyData.map((d) => d["Net Sales"])) : 0),
    [dailyData],
  );

  const topItems = useMemo(
    () => (data?.topItems ?? []).map((t) => ({ name: t.name, Revenue: Math.round(t.revenue * 100) / 100 })),
    [data],
  );

  const stats = data?.orderStats;

  return (
    <div className="space-y-6">
      <DataGapBanner dataStartsAt={data?.dataStartsAt} salesNote />

      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <>
          {/* KPI strip — order-level stats; no customer count exists in the data */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Net Sales (order days)" value={fmtMoney0(netSalesOrderPeriod)}
              sub={`since ${dateShort(dataStartsAt)} — excludes CSV backfill`} />
            <KpiCard label="Total Orders" value={(stats?.totalOrders ?? 0).toLocaleString()}
              sub={`${stats?.daysWithOrderData ?? 0} days with order data`} />
            <KpiCard label="Avg Order Value" value={fmtMoney2(stats?.avgOrderValue ?? 0)} />
            <KpiCard label="Avg Items per Order" value={(stats?.avgItemsPerOrder ?? 0).toFixed(1)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Section title="Top Items by Revenue">
              {topItems.length === 0 ? (
                <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No order data in this range.</p>
              ) : (
                <div className="px-2 pt-6 pb-4">
                  <ResponsiveContainer width="100%" height={Math.max(220, topItems.length * 32)}>
                    <BarChart data={topItems} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisMoney} />
                      <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fill: "#6b7280" }} axisLine={false} tickLine={false} width={140} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="Revenue" fill={BROWN} radius={[0, 3, 3, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 mt-1`}>
                    Top 10 Square line items by revenue. Square items carry no category, so this replaces the old
                    &ldquo;Revenue by Category&rdquo; view.
                  </p>
                </div>
              )}
            </Section>

            <Section title="Revenue by Day of Week">
              {dowData.length === 0 ? (
                <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No order data in this range.</p>
              ) : (
                <div className="px-2 pt-6 pb-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dowData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false}
                        tickFormatter={(d: string) => d.slice(0, 3)} interval={0} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar
                        dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]} maxBarSize={48}
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
                      : `Filtering daily revenue to ${DOW_NAMES[selectedDow]}s — click the bar again to reset.`}
                  </p>
                </div>
              )}
            </Section>
          </div>

          <Section
            title={selectedDow == null ? "Daily Revenue" : `Daily Revenue — ${DOW_NAMES[selectedDow]}s only`}
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
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                      <Tooltip content={<MoneyTooltip />} />
                      <ReferenceLine y={dailyAvg} stroke={BROWN} strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: `Avg ${fmtMoney0(dailyAvg)}`, position: "right", fontSize: 10, fill: BROWN, fontFamily: "var(--font-display,monospace)" }} />
                      <ReferenceLine y={dailyMax} stroke="#9ca3af" strokeDasharray="2 4" strokeWidth={1}
                        label={{ value: `Max ${fmtMoney0(dailyMax)}`, position: "right", fontSize: 10, fill: "#9ca3af", fontFamily: "var(--font-display,monospace)" }} />
                      <Area type="monotone" dataKey="Net Sales" stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  ) : (
                    <LineChart data={dailyData} margin={{ top: 8, right: 72, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={40} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                      <Tooltip content={<MoneyTooltip />} />
                      <ReferenceLine y={dailyAvg} stroke={BROWN} strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: `Avg ${fmtMoney0(dailyAvg)}`, position: "right", fontSize: 10, fill: BROWN, fontFamily: "var(--font-display,monospace)" }} />
                      <Line type="monotone" dataKey="Net Sales" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
