"use client";

// Capacity tab — booking/session behavior, relocated from the old standalone
// Overview page: KPI strip (party size, cancellation rate), booked-seats-per-day
// trend, the day×time heatmap, and the repeat-customers section.

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import type { BookingRecord } from "@/lib/supabase";
import {
  BarChart, Bar, Cell, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { EstimatedBookingsResponse, LoadingOrError, Section, KpiCard, GREEN, monthShort, monthTick, monthsBetween, AXIS_TICK } from "./shared";
import {
  TimeFrame, TfToggle, ChartTooltip, fmtPct,
  buildCapacityData, buildHeatmap, buildRepeatData, buildRepeatChart,
  DOW_LABELS, DOW_ORDER, ONLINE_BOOKING_LAUNCH, rangeBounds,
} from "./bookingShared";

const ESTIMATE_FILL = "#A9CDB6"; // GREEN, lightened — pre-launch estimate bars

export default function CapacityView({ bookings, query, estimated, estimatedLoading }: {
  bookings: BookingRecord[];
  query: string;
  estimated: EstimatedBookingsResponse | null;
  estimatedLoading: boolean;
}) {
  const [capDays, setCapDays] = useState<30 | 60 | 90>(30);
  const [repeatTf, setRepeatTf] = useState<TimeFrame>("month");

  const confirmed = useMemo(() => bookings.filter((b) => b.status === "confirmed"), [bookings]);
  const cancelled = useMemo(() => bookings.filter((b) => b.status === "cancelled"), [bookings]);

  const avgParty = useMemo(
    () => (confirmed.length ? confirmed.reduce((s, b) => s + b.party_size, 0) / confirmed.length : 0),
    [confirmed],
  );
  const cancelRate = bookings.length > 0 ? cancelled.length / bookings.length : 0;

  const capacityData = useMemo(() => buildCapacityData(bookings, capDays), [bookings, capDays]);

  // Seats booked by month, full selected range — unlike the trailing daily
  // chart above (capped at 90 days), this reaches back before
  // ONLINE_BOOKING_LAUNCH by falling back to the Square-order estimate for
  // any month the real `bookings` table has no rows for.
  const monthlySeats = useMemo(() => {
    const realByMonth = new Map<string, number>();
    for (const b of bookings) {
      if (b.status !== "confirmed") continue;
      const key = b.date.slice(0, 7);
      realByMonth.set(key, (realByMonth.get(key) ?? 0) + b.party_size);
    }
    const estByMonth = new Map<string, number>();
    for (const row of estimated?.daily ?? []) {
      if (row.date >= ONLINE_BOOKING_LAUNCH) continue;
      const key = row.date.slice(0, 7);
      estByMonth.set(key, (estByMonth.get(key) ?? 0) + row.seats);
    }
    const { start, end } = rangeBounds(query);
    const months = start && end
      ? monthsBetween(start, end)
      : [...new Set([...realByMonth.keys(), ...estByMonth.keys()])].sort();
    const cutoverMonth = ONLINE_BOOKING_LAUNCH.slice(0, 7);
    return months.map((m) => {
      const isEstimate = m < cutoverMonth;
      return {
        label: monthShort(`${m}-01`),
        seats: isEstimate ? (estByMonth.get(m) ?? 0) : (realByMonth.get(m) ?? 0),
        estimated: isEstimate,
      };
    });
  }, [bookings, estimated, query]);
  const { slots: heatSlots, cells: heatCells, maxCount: heatMax } = useMemo(() => buildHeatmap(bookings), [bookings]);
  const { tagged, uniqueCustomers, returningCustomers, cohortRows } = useMemo(() => buildRepeatData(bookings), [bookings]);
  const repeatChartData = useMemo(() => buildRepeatChart(tagged, repeatTf), [tagged, repeatTf]);
  const realRepeatRate = uniqueCustomers > 0 ? returningCustomers / uniqueCustomers : 0;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Avg party size" value={avgParty.toFixed(1)} sub="confirmed bookings" />
        <KpiCard label="Cancellation rate" value={fmtPct(cancelRate)} sub={`${cancelled.length} of ${bookings.length} total`} />
      </div>

      {/* Booked seats trend */}
      <Section
        title="Booked seats per day"
        action={
          <div className="flex rounded-lg border border-black/15 overflow-hidden">
            {([30, 60, 90] as const).map((d) => (
              <button key={d} onClick={() => setCapDays(d)}
                className={`${vulfMono.className} px-3 py-1.5 text-xs transition-colors ${capDays === d ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      >
        <div className="px-2 pt-4 pb-2">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={capacityData} margin={{ top: 4, right: 32, left: 0, bottom: 4 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={Math.floor(capDays / 8)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const seats = payload.find((p) => p.dataKey === "seats")?.value as number | undefined;
                  const avg7 = payload.find((p) => p.dataKey === "avg7")?.value as number | undefined;
                  return (
                    <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px" }}>
                      <p style={{ fontWeight: "bold", color: "#374151", marginBottom: 4 }}>{label}</p>
                      <p style={{ color: "#519A70" }}>{seats ?? 0} seats booked</p>
                      {avg7 != null && <p style={{ color: "#884A20" }}>{avg7} avg (7-day)</p>}
                    </div>
                  );
                }}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="seats" fill="#519A70" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Line type="monotone" dataKey="avg7" stroke="#884A20" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-1">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#519A70]" /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>Seats booked</span></div>
            <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full bg-[#884A20]" /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>7-day rolling avg</span></div>
          </div>
          <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1 pb-3`}>
            Booked seats by session date. The line is the average of that day and the previous six -- read it for trend and week-over-week direction, not against a capacity ceiling.
          </p>
        </div>
      </Section>

      {/* Seats by month, full range — the only view that reaches before ONLINE_BOOKING_LAUNCH */}
      <Section title="Seats booked by month">
        {estimatedLoading ? (
          <LoadingOrError loading error={null} />
        ) : monthlySeats.length === 0 ? (
          <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No data in this range.</p>
        ) : (
          <div className="px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlySeats} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={monthTick} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { seats: number; estimated: boolean } | undefined;
                    if (!row) return null;
                    return (
                      <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px" }}>
                        <p style={{ fontWeight: "bold", color: "#374151", marginBottom: 4 }}>{label}</p>
                        <p style={{ color: GREEN }}>{row.seats} seats {row.estimated ? "(estimated)" : "booked"}</p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="seats" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {monthlySeats.map((row, i) => (
                    <Cell key={i} fill={row.estimated ? ESTIMATE_FILL : GREEN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-1">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: GREEN }} /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>Booked (real)</span></div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ESTIMATE_FILL }} /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>Estimated (pre-launch)</span></div>
            </div>
            <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1 pb-3`}>
              Online booking launched {monthShort(ONLINE_BOOKING_LAUNCH)}. Before that, the online widget has no
              records at all — the lighter bars estimate seats from Square orders with a General Admission item
              (booked via Acuity Scheduling), so treat them as directional, not exact.
            </p>
          </div>
        )}
      </Section>

      {/* Day x time heatmap */}
      <Section title="Booking heatmap -- day of week vs time slot">
        {heatSlots.length === 0 ? (
          <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-8 text-center`}>No booking data yet.</p>
        ) : (
          <div className="px-6 py-5 overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex mb-1">
                <div className="w-10 shrink-0" />
                {heatSlots.map((slot) => (
                  <div key={slot} className={`${vulfMono.className} text-[9px] text-neutral-400 text-center flex-1 min-w-[44px] pb-1.5 leading-tight`}>
                    {slot}
                  </div>
                ))}
              </div>
              {DOW_ORDER.map((dow, rowIdx) => (
                <div key={dow} className="flex items-center mb-1">
                  <div className={`${vulfMono.className} text-[10px] text-neutral-500 w-10 shrink-0 pr-2 text-right`}>
                    {DOW_LABELS[rowIdx]}
                  </div>
                  {heatSlots.map((slot) => {
                    const count = heatCells[dow]?.[slot] ?? 0;
                    const intensity = heatMax > 0 ? count / heatMax : 0;
                    const bg = intensity === 0 ? "rgba(0,0,0,0.04)" : `rgba(81,154,112,${(0.15 + intensity * 0.85).toFixed(2)})`;
                    return (
                      <div key={slot} title={`${DOW_LABELS[rowIdx]} ${slot}: ${count} booking${count !== 1 ? "s" : ""}`}
                        className="flex-1 min-w-[44px] h-8 rounded flex items-center justify-center mx-0.5"
                        style={{ backgroundColor: bg }}>
                        {count > 0 && (
                          <span className={`${vulfMono.className} text-[9px] font-medium`} style={{ color: intensity > 0.5 ? "white" : "#374151" }}>
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className={`${vulfMono.className} text-[10px] text-neutral-400 mt-4`}>
              All confirmed bookings by day of week and session time. Darker = more bookings.
            </p>
          </div>
        )}
      </Section>

      {/* Repeat customers */}
      <Section title="Repeat customers" action={<TfToggle value={repeatTf} onChange={setRepeatTf} />}>
        <div className="px-6 pt-5 pb-4 border-b border-black/8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400`}>New vs. returning over time</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500`}>
              Repeat rate: <span className="font-semibold text-neutral-700">{fmtPct(realRepeatRate)}</span>
              <span className="text-neutral-400"> ({returningCustomers} of {uniqueCustomers} unique customers)</span>
            </p>
          </div>
          {tagged.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>No confirmed bookings yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={repeatChartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="New" stackId="a" fill="#519A70" maxBarSize={56} />
                  <Bar dataKey="Returning" stackId="a" fill="#884A20" radius={[3, 3, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#519A70]" /><span className={`${vulfMono.className} text-xs text-neutral-500`}>New</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#884A20]" /><span className={`${vulfMono.className} text-xs text-neutral-500`}>Returning</span></div>
              </div>
            </>
          )}
        </div>

        {/* Cohort table */}
        <div className="px-6 py-5">
          <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 mb-4`}>Monthly cohort retention</p>
          {cohortRows.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>Not enough data yet.</p>
          ) : (
            <table className={`${vulfMono.className} w-full text-sm`}>
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="pb-3 font-medium">First booking month</th>
                  <th className="pb-3 font-medium text-right">New customers</th>
                  <th className="pb-3 font-medium text-right">Booked again</th>
                  <th className="pb-3 font-medium text-right">Retention</th>
                </tr>
              </thead>
              <tbody>
                {cohortRows.map((row) => {
                  const pct = row.total > 0 ? Math.round((row.returned / row.total) * 100) : 0;
                  const label = new Date(row.month + "-01T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
                  return (
                    <tr key={row.month} className="border-b border-black/5 last:border-0">
                      <td className="py-2.5 text-neutral-700">{label}</td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-600">{row.total}</td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-600">{row.returned}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-black/5 overflow-hidden">
                            <div className="h-full rounded-full bg-[#884A20]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular-nums text-neutral-500 w-7 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className={`${vulfMono.className} text-[10px] text-neutral-400 mt-4`}>
            {`Identity is matched by phone number OR email (not email alone), so a group booking under a different
            guest email still counts as the same customer when the phone matches. Still imperfect -- a shared
            family phone can merge two people, and a new email + new phone looks like a new customer. Not based
            on the self-reported "Returning Customer" source label. Cohort retention = % of first-time customers
            in that month who made at least one additional booking.`}
          </p>
        </div>
      </Section>
    </div>
  );
}
