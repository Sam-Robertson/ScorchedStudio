"use client";

// Marketing tab — spend vs. results. KPI row (spend, bookings, cost per
// booking, top channel), a spend-vs-bookings combo chart by month, plus the
// bookings-by-source chart and breakdown table relocated from the old
// standalone Overview page.

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import type { BookingRecord } from "@/lib/supabase";
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CostsResponse, Section, KpiCard, LoadingOrError,
  fmtMoney0, fmtAxisMoney, monthShort, monthTick, AXIS_TICK, GRID_STROKE, BROWN, GREEN,
} from "./shared";
import {
  REFERRAL_OPTIONS, SOURCE_COLORS, TimeFrame, TfToggle, ChartTooltip,
  buildSourceChart, bookingsInRange, topChannel, fmt$,
} from "./bookingShared";

const MARKETING_CODE = "6200";

type SortDir = "desc" | "asc";
type SortCol = "count" | "revenue" | "party" | "cancel";

export default function MarketingView({ bookings, costs, costsLoading, query }: {
  bookings: BookingRecord[];
  costs: CostsResponse | null;
  costsLoading: boolean;
  query: string;
}) {
  const [sourceTf, setSourceTf] = useState<TimeFrame>("month");
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const confirmed = useMemo(() => bookings.filter((b) => b.status === "confirmed"), [bookings]);
  const rangedConfirmed = useMemo(() => bookingsInRange(confirmed, query), [confirmed, query]);

  // ── KPI row ────────────────────────────────────────────────────────────────

  const marketingSpend = useMemo(
    () => (costs?.breakdown ?? []).filter((b) => b.code === MARKETING_CODE).reduce((s, b) => s + b.amount, 0),
    [costs],
  );
  const marketingName = useMemo(
    () => (costs?.breakdown ?? []).find((b) => b.code === MARKETING_CODE)?.name ?? "Marketing",
    [costs],
  );
  const top = useMemo(() => topChannel(rangedConfirmed), [rangedConfirmed]);
  const costPerBooking = rangedConfirmed.length > 0 ? marketingSpend / rangedConfirmed.length : null;

  // ── Spend vs bookings by month ─────────────────────────────────────────────
  // Two sources merged by month: the Costs report's monthly Marketing figure
  // and a month-bucketed count of confirmed bookings (by created_at) within
  // the same range.

  const spendVsBookings = useMemo(() => {
    const spendByMonth = new Map<string, number>(); // YYYY-MM -> $
    for (const row of costs?.monthlyCategories ?? []) {
      const val = row[marketingName];
      if (typeof val !== "number") continue;
      const key = String(row.period_month).slice(0, 7);
      spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + val);
    }
    const bookingsByMonth = new Map<string, number>();
    for (const b of rangedConfirmed) {
      const key = b.created_at.slice(0, 7);
      bookingsByMonth.set(key, (bookingsByMonth.get(key) ?? 0) + 1);
    }
    const months = [...new Set([...spendByMonth.keys(), ...bookingsByMonth.keys()])].sort();
    return months.map((m) => ({
      label: monthShort(`${m}-01`),
      "Marketing Spend": Math.round((spendByMonth.get(m) ?? 0) * 100) / 100,
      Bookings: bookingsByMonth.get(m) ?? 0,
    }));
  }, [costs, marketingName, rangedConfirmed]);

  // ── Bookings by source (relocated from the old Overview page) ──────────────

  const presentSources = useMemo(() => {
    const seen = new Set<string>();
    for (const b of confirmed) seen.add(b.referral_source || "(not recorded)");
    return [...REFERRAL_OPTIONS.filter((o) => seen.has(o)), ...[...seen].filter((s) => !REFERRAL_OPTIONS.includes(s))];
  }, [confirmed]);

  const activeSources = useMemo(() => new Set(presentSources.filter((s) => !hiddenSources.has(s))), [presentSources, hiddenSources]);
  const activeSourcesList = useMemo(() => [...activeSources], [activeSources]);
  const sourceChartData = useMemo(() => buildSourceChart(confirmed, sourceTf, activeSources), [confirmed, sourceTf, activeSources]);

  const { sourceRows, otherDetails } = useMemo(() => {
    const data: Record<string, { conf: number; canc: number; seats: number; rev: number }> = {};
    for (const b of bookings) {
      const src = b.referral_source || "(not recorded)";
      if (!data[src]) data[src] = { conf: 0, canc: 0, seats: 0, rev: 0 };
      if (b.status === "confirmed") { data[src].conf++; data[src].seats += b.party_size; data[src].rev += b.amount_paid ?? 0; }
      else data[src].canc++;
    }
    const rows = [
      ...REFERRAL_OPTIONS.filter((o) => data[o]).map((o) => ({ label: o, ...data[o] })),
      ...Object.entries(data).filter(([k]) => !REFERRAL_OPTIONS.includes(k)).map(([k, v]) => ({ label: k, ...v })),
    ];
    rows.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortCol === "count") { av = a.conf; bv = b.conf; }
      else if (sortCol === "revenue") { av = a.rev; bv = b.rev; }
      else if (sortCol === "party") { av = a.conf > 0 ? a.seats / a.conf : 0; bv = b.conf > 0 ? b.seats / b.conf : 0; }
      else { const ta = a.conf + a.canc, tb = b.conf + b.canc; av = ta > 0 ? a.canc / ta : 0; bv = tb > 0 ? b.canc / tb : 0; }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    const others = bookings.filter((b) => b.referral_source === "Other" && b.referral_other).map((b) => b.referral_other!);
    return { sourceRows: rows, otherDetails: others };
  }, [bookings, sortCol, sortDir]);

  function toggleSource(src: string) {
    setHiddenSources((prev) => { const n = new Set(prev); if (n.has(src)) { n.delete(src); } else { n.add(src); } return n; });
  }
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const Th = ({ label, col, right }: { label: string; col?: SortCol; right?: boolean }) => (
    <th
      onClick={col ? () => toggleSort(col) : undefined}
      className={`px-4 pb-3 pt-4 font-medium whitespace-nowrap ${right ? "text-right" : ""} ${col ? "cursor-pointer select-none hover:text-neutral-600" : ""} ${sortCol === col ? "text-neutral-700" : ""}`}
    >
      {label}{col && sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Marketing spend" value={costsLoading ? "…" : fmtMoney0(marketingSpend)} sub="account 6200, selected range" />
        <KpiCard label="Confirmed bookings" value={rangedConfirmed.length.toLocaleString()} sub="selected range" />
        <KpiCard
          label="Cost per booking"
          value={costsLoading ? "…" : costPerBooking == null ? "—" : fmtMoney0(costPerBooking)}
          sub="spend ÷ confirmed bookings"
        />
        <KpiCard
          label="Top channel"
          value={top ? top.source : "—"}
          sub={top ? `${top.count} confirmed bookings` : "no bookings in range"}
        />
      </div>

      {/* Spend vs bookings combo chart */}
      <Section title="Marketing spend vs. bookings by month">
        {costsLoading ? (
          <LoadingOrError loading error={null} />
        ) : spendVsBookings.length === 0 ? (
          <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No data in this range.</p>
        ) : (
          <div className="px-2 pt-6 pb-4">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={spendVsBookings} margin={{ top: 4, right: 8, left: 4, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={monthTick} />
                <YAxis yAxisId="spend" tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                <YAxis yAxisId="bookings" orientation="right" allowDecimals={false} tick={{ ...AXIS_TICK, fill: GREEN }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const spend = payload.find((p) => p.dataKey === "Marketing Spend")?.value as number | undefined;
                    const count = payload.find((p) => p.dataKey === "Bookings")?.value as number | undefined;
                    return (
                      <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px" }}>
                        <p style={{ fontWeight: "bold", color: "#374151", marginBottom: 4 }}>{label}</p>
                        <p style={{ color: BROWN }}>{fmtMoney0(spend ?? 0)} marketing spend</p>
                        <p style={{ color: GREEN }}>{count ?? 0} confirmed bookings</p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar yAxisId="spend" dataKey="Marketing Spend" fill={BROWN} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Line yAxisId="bookings" type="monotone" dataKey="Bookings" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-1">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#884A20]" /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>Marketing spend ($, left)</span></div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full bg-[#418A5C]" /><span className={`${vulfMono.className} text-[10px] text-neutral-400`}>Confirmed bookings (count, right)</span></div>
            </div>
            <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1 pb-2`}>
              Spend from the accounting ledger (account 6200); bookings counted by the date they were made.
            </p>
          </div>
        )}
      </Section>

      {/* Bookings by source over time */}
      <Section title="Bookings by source over time" action={<TfToggle value={sourceTf} onChange={setSourceTf} />}>
        {presentSources.length === 0 ? (
          <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No data yet.</p>
        ) : (
          <div className="px-2 pt-6 pb-4">
            <div className="flex flex-wrap gap-2 px-4 mb-5">
              {presentSources.map((src) => {
                const active = !hiddenSources.has(src);
                const color = SOURCE_COLORS[src] ?? "#888";
                return (
                  <button key={src} onClick={() => toggleSource(src)}
                    className={`${vulfMono.className} flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all ${active ? "border-transparent text-white" : "border-black/15 text-neutral-400 bg-white"}`}
                    style={active ? { backgroundColor: color } : {}}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : color }} />
                    {src}
                  </button>
                );
              })}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sourceChartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                {activeSourcesList.map((src, i) => (
                  <Bar key={src} dataKey={src} stackId="a" fill={SOURCE_COLORS[src] ?? "#888"} radius={i === activeSourcesList.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} maxBarSize={56} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Source breakdown table */}
      <Section title="Breakdown by source">
        {bookings.length === 0 ? (
          <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-8 text-center`}>No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${vulfMono.className} w-full min-w-[700px] text-sm`}>
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-6 pb-3 pt-4 font-medium">Source</th>
                  <Th label="Bookings" col="count" right />
                  <th className="px-4 pb-3 pt-4 font-medium text-right">Share</th>
                  <Th label="Avg party" col="party" right />
                  <Th label="Avg revenue" col="revenue" right />
                  <Th label="Cancel rate" col="cancel" right />
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((row) => {
                  const total = row.conf + row.canc;
                  const pct = confirmed.length > 0 ? Math.round((row.conf / confirmed.length) * 100) : 0;
                  const avgPty = row.conf > 0 ? (row.seats / row.conf).toFixed(1) : "--";
                  const avgRev = row.conf > 0 ? fmt$(Math.round(row.rev / row.conf)) : "--";
                  const cancelPct = total > 0 ? Math.round((row.canc / total) * 100) : 0;
                  const color = SOURCE_COLORS[row.label] ?? "#888";
                  return (
                    <tr key={row.label} className="border-b border-black/5 last:border-0 hover:bg-neutral-50/60">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-neutral-800">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-700">{row.conf}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="hidden sm:block w-16 h-1.5 rounded-full bg-black/5 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-neutral-400 tabular-nums w-7 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{avgPty}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{avgRev}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`tabular-nums ${cancelPct > 20 ? "text-red-600 font-medium" : "text-neutral-400"}`}>{cancelPct}%</span>
                        {row.canc > 0 && <span className="text-neutral-300 ml-1">({row.canc})</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {otherDetails.length > 0 && (
              <div className="px-6 py-4 border-t border-black/5">
                <details>
                  <summary className={`${vulfMono.className} text-xs text-neutral-400 cursor-pointer hover:text-neutral-600`}>
                    &quot;Other&quot; responses ({otherDetails.length})
                  </summary>
                  <ul className="mt-3 space-y-1.5">
                    {otherDetails.map((d, i) => (
                      <li key={i} className={`${vulfMono.className} text-xs text-neutral-600 pl-3 border-l-2 border-black/10`}>{d}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
