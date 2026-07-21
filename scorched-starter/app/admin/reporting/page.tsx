"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import type { BookingRecord } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Config ────────────────────────────────────────────────────────────────────

// TODO: set real per-location capacity once confirmed.
// Orem estimate: Mon-Fri 8 slots x 20 seats = 160; Sat 19 slots x 20 = 380.
// Orem and SLC will differ -- update when SLC opens.
const STUDIO_MAX_SEATS_PER_DAY = 160;

// ── Source config ─────────────────────────────────────────────────────────────

const REFERRAL_OPTIONS = [
  "Get Out Pass",
  "Family/Friend",
  "TikTok",
  "In-Person/Drive by",
  "Returning Customer",
  "Instagram",
  "Google Search/Maps",
  "Other",
];

const SOURCE_COLORS: Record<string, string> = {
  "Get Out Pass":        "#884A20",
  "Family/Friend":       "#519A70",
  "TikTok":              "#EF4444",
  "In-Person/Drive by":  "#F59E0B",
  "Returning Customer":  "#8B5CF6",
  "Instagram":           "#EC4899",
  "Google Search/Maps":  "#3B82F6",
  "Other":               "#9CA3AF",
  "(not recorded)":      "#D1D5DB",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeFrame = "week" | "month" | "year";
type SortDir = "desc" | "asc";
type SortCol = "count" | "revenue" | "party" | "cancel";
type Location = "all" | "orem" | "slc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getBuckets(tf: TimeFrame): { key: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (tf === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { key: toDateStr(d), label: d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }) };
    });
  }
  if (tf === "month") {
    const out: { key: string; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(today, -(i * 7 + today.getDay()));
      out.push({ key: toDateStr(ws), label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
    }
    return out;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) };
  });
}

function bucketKey(createdAt: string, tf: TimeFrame): string {
  const d = new Date(createdAt);
  if (tf === "week") return toDateStr(d);
  if (tf === "year") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const sun = addDays(d, -d.getDay());
  sun.setHours(0, 0, 0, 0);
  return toDateStr(sun);
}

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function parseSlotMinutes(slot: string): number {
  const [time, ampm = "AM"] = slot.trim().split(" ");
  const [h, m = 0] = time.split(":").map(Number);
  const hours = ampm.toUpperCase() === "PM" && h !== 12 ? h + 12 : ampm.toUpperCase() === "AM" && h === 12 ? 0 : h;
  return hours * 60 + m;
}

// ── Shared tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const items = [...payload].reverse().filter((p) => p.value > 0);
  if (!items.length) return null;
  const total = items.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px", minWidth: 160 }}>
      <p style={{ fontWeight: "bold", marginBottom: 6, color: "#374151" }}>
        {label}<span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>({total})</span>
      </p>
      {items.map((item) => (
        <p key={item.dataKey} style={{ padding: "2px 0", color: item.fill }}>{item.dataKey}: {item.value}</p>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-black/10">
        <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm px-5 py-4">
      <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 mb-1`}>{label}</p>
      <p className="text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      {sub && <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>{sub}</p>}
    </div>
  );
}

// ── Tf toggle ─────────────────────────────────────────────────────────────────

function TfToggle({ value, onChange }: { value: TimeFrame; onChange: (tf: TimeFrame) => void }) {
  return (
    <div className="flex rounded-lg border border-black/15 overflow-hidden self-start sm:self-auto">
      {(["week", "month", "year"] as TimeFrame[]).map((tf) => (
        <button key={tf} onClick={() => onChange(tf)}
          className={`${vulfMono.className} px-4 py-1.5 text-xs capitalize transition-colors ${value === tf ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
          {tf}
        </button>
      ))}
    </div>
  );
}

// ── Data builders ─────────────────────────────────────────────────────────────

function buildSourceChart(bookings: BookingRecord[], tf: TimeFrame, active: Set<string>) {
  const buckets = getBuckets(tf);
  const bucketSet = new Set(buckets.map((b) => b.key));
  const map: Record<string, Record<string, number>> = {};
  for (const b of buckets) { map[b.key] = {}; for (const s of active) map[b.key][s] = 0; }
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const src = b.referral_source || "(not recorded)";
    if (!active.has(src)) continue;
    const key = bucketKey(b.created_at, tf);
    if (!bucketSet.has(key)) continue;
    map[key][src] = (map[key][src] ?? 0) + 1;
  }
  return buckets.map(({ key, label }) => ({ label, ...map[key] }));
}

function buildCapacityData(bookings: BookingRecord[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const ds = toDateStr(d);
    const seats = bookings.filter((b) => b.status === "confirmed" && b.date === ds).reduce((s, b) => s + b.party_size, 0);
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), seats, pct: Math.min(100, Math.round((seats / STUDIO_MAX_SEATS_PER_DAY) * 100)) };
  });
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

function buildHeatmap(bookings: BookingRecord[]) {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const slotSet = new Set<string>();
  for (const b of confirmed) if (b.time_slot) slotSet.add(b.time_slot);
  const slots = [...slotSet].sort((a, b) => parseSlotMinutes(a) - parseSlotMinutes(b));
  const cells: Record<number, Record<string, number>> = {};
  for (const dow of DOW_ORDER) cells[dow] = {};
  for (const b of confirmed) {
    if (!b.time_slot || !b.date) continue;
    const dow = new Date(b.date + "T12:00:00").getDay();
    cells[dow][b.time_slot] = (cells[dow][b.time_slot] ?? 0) + 1;
  }
  let maxCount = 0;
  for (const dow of DOW_ORDER) for (const s of slots) { const c = cells[dow][s] ?? 0; if (c > maxCount) maxCount = c; }
  return { slots, cells, maxCount };
}

type Tagged = BookingRecord & { isReturning: boolean };

function buildRepeatData(bookings: BookingRecord[]) {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const byEmail: Record<string, BookingRecord[]> = {};
  for (const b of confirmed) {
    const k = b.email.toLowerCase().trim();
    if (!byEmail[k]) byEmail[k] = [];
    byEmail[k].push(b);
  }
  for (const k in byEmail) byEmail[k].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const firstId: Record<string, string> = {};
  for (const k in byEmail) firstId[k] = byEmail[k][0].id;

  const tagged: Tagged[] = confirmed.map((b) => ({ ...b, isReturning: firstId[b.email.toLowerCase().trim()] !== b.id }));

  const uniqueCustomers = Object.keys(byEmail).length;
  const returningCustomers = Object.values(byEmail).filter((bs) => bs.length > 1).length;

  const cohortMap: Record<string, { total: number; returned: number }> = {};
  for (const bs of Object.values(byEmail)) {
    const month = bs[0].created_at.slice(0, 7);
    if (!cohortMap[month]) cohortMap[month] = { total: 0, returned: 0 };
    cohortMap[month].total++;
    if (bs.length >= 2) cohortMap[month].returned++;
  }
  const cohortRows = Object.entries(cohortMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

  return { tagged, uniqueCustomers, returningCustomers, cohortRows };
}

function buildRepeatChart(tagged: Tagged[], tf: TimeFrame) {
  const buckets = getBuckets(tf);
  const bucketSet = new Set(buckets.map((b) => b.key));
  const map: Record<string, { New: number; Returning: number }> = {};
  for (const b of buckets) map[b.key] = { New: 0, Returning: 0 };
  for (const b of tagged) {
    const key = bucketKey(b.created_at, tf);
    if (!bucketSet.has(key)) continue;
    if (b.isReturning) map[key].Returning++; else map[key].New++;
  }
  return buckets.map(({ key, label }) => ({ label, ...map[key] }));
}

// ── Main dashboard ────────────────────────────────────────────────────────────

function ReportingDashboard({ token }: { token: string }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceTf, setSourceTf] = useState<TimeFrame>("month");
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [capDays, setCapDays] = useState<30 | 60 | 90>(30);
  const [repeatTf, setRepeatTf] = useState<TimeFrame>("month");
  const [location, setLocation] = useState<Location>("all");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/bookings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => { setBookings(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Location filter: no effect until bookings gain a location column.
  // When SLC is selected we show a notice and treat data as empty.
  const locationBookings = useMemo(() => location === "slc" ? [] : bookings, [bookings, location]);

  const confirmed = useMemo(() => locationBookings.filter((b) => b.status === "confirmed"), [locationBookings]);
  const cancelled = useMemo(() => locationBookings.filter((b) => b.status === "cancelled"), [locationBookings]);

  // KPIs
  const totalRevCents = useMemo(() => confirmed.reduce((s, b) => s + (b.amount_paid ?? 0), 0), [confirmed]);
  const avgParty = useMemo(() => confirmed.length ? confirmed.reduce((s, b) => s + b.party_size, 0) / confirmed.length : 0, [confirmed]);
  const cancelRate = locationBookings.length > 0 ? cancelled.length / locationBookings.length : 0;

  // Source chart
  const presentSources = useMemo(() => {
    const seen = new Set<string>();
    for (const b of confirmed) seen.add(b.referral_source || "(not recorded)");
    return [...REFERRAL_OPTIONS.filter((o) => seen.has(o)), ...[...seen].filter((s) => !REFERRAL_OPTIONS.includes(s))];
  }, [confirmed]);

  const activeSources = useMemo(() => new Set(presentSources.filter((s) => !hiddenSources.has(s))), [presentSources, hiddenSources]);
  const activeSourcesList = useMemo(() => [...activeSources], [activeSources]);

  const sourceChartData = useMemo(() => buildSourceChart(confirmed, sourceTf, activeSources), [confirmed, sourceTf, activeSources]);

  // Source table
  const { sourceRows, otherDetails } = useMemo(() => {
    const data: Record<string, { conf: number; canc: number; seats: number; rev: number }> = {};
    for (const b of locationBookings) {
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
    const others = locationBookings.filter((b) => b.referral_source === "Other" && b.referral_other).map((b) => b.referral_other!);
    return { sourceRows: rows, otherDetails: others };
  }, [locationBookings, sortCol, sortDir]);

  // Capacity
  const capacityData = useMemo(() => buildCapacityData(locationBookings, capDays), [locationBookings, capDays]);

  // Heatmap
  const { slots: heatSlots, cells: heatCells, maxCount: heatMax } = useMemo(() => buildHeatmap(locationBookings), [locationBookings]);

  // Repeat
  const { tagged, uniqueCustomers, returningCustomers, cohortRows } = useMemo(() => buildRepeatData(bookings), [bookings]);
  const repeatChartData = useMemo(() => buildRepeatChart(tagged, repeatTf), [tagged, repeatTf]);
  const realRepeatRate = uniqueCustomers > 0 ? returningCustomers / uniqueCustomers : 0;

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
    <section className="container-px py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Reporting</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${vulfMono.className} text-xs text-neutral-400`}>Location</span>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value as Location)}
            className={`${vulfMono.className} text-xs border border-black/20 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-black/40`}
          >
            <option value="all">All</option>
            <option value="orem">Orem</option>
            <option value="slc">SLC</option>
          </select>
        </div>
      </div>

      {loading && <p className={`${vulfMono.className} text-sm text-neutral-500 py-20 text-center`}>Loading...</p>}
      {error && <p className="text-sm text-red-600 py-10 text-center">Error: {error}</p>}

      {!loading && !error && (
        <div className="space-y-6">

          {/* SLC placeholder notice */}
          {location === "slc" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className={`${vulfMono.className} text-xs font-bold text-amber-700 mb-0.5`}>SLC is pre-launch</p>
              <p className={`${vulfMono.className} text-xs text-amber-600`}>
                Bookings do not yet have a location column. Add a <code>location text</code> column to the bookings table and filter here once SLC opens.
              </p>
            </div>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Confirmed bookings" value={confirmed.length.toLocaleString()} />
            <KpiCard label="Entry-fee revenue" value={fmt$(totalRevCents)} sub="Stripe only -- product sales in Domo" />
            <KpiCard label="Avg party size" value={avgParty.toFixed(1)} sub="confirmed bookings" />
            <KpiCard label="Cancellation rate" value={fmtPct(cancelRate)} sub={`${cancelled.length} of ${locationBookings.length} total`} />
            <KpiCard label="Repeat customer rate" value={fmtPct(realRepeatRate)} sub={`${returningCustomers} of ${uniqueCustomers} unique emails`} />
          </div>

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
            {locationBookings.length === 0 ? (
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

          {/* Capacity utilization */}
          <Section
            title="Capacity utilization -- booked seats per day"
            action={
              <div className="flex items-center gap-3">
                <span className={`${vulfMono.className} text-[10px] text-neutral-400`}>max {STUDIO_MAX_SEATS_PER_DAY} seats/day</span>
                <div className="flex rounded-lg border border-black/15 overflow-hidden">
                  {([30, 60, 90] as const).map((d) => (
                    <button key={d} onClick={() => setCapDays(d)}
                      className={`${vulfMono.className} px-3 py-1.5 text-xs transition-colors ${capDays === d ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            <div className="px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={capacityData} margin={{ top: 4, right: 32, left: 0, bottom: 4 }} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={Math.floor(capDays / 8)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} domain={[0, Math.max(STUDIO_MAX_SEATS_PER_DAY * 1.1, 10)]} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const seats = payload[0].value as number;
                      const pct = Math.round((seats / STUDIO_MAX_SEATS_PER_DAY) * 100);
                      return (
                        <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px" }}>
                          <p style={{ fontWeight: "bold", color: "#374151", marginBottom: 4 }}>{label}</p>
                          <p style={{ color: "#519A70" }}>{seats} seats booked</p>
                          <p style={{ color: "#9ca3af" }}>{pct}% of configured max</p>
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <ReferenceLine y={STUDIO_MAX_SEATS_PER_DAY} stroke="#884A20" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: "Max", position: "right", fontSize: 10, fill: "#884A20", fontFamily: "var(--font-display,monospace)" }} />
                  <Bar dataKey="seats" fill="#519A70" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <p className={`${vulfMono.className} text-[10px] text-neutral-400 text-center mt-1 pb-3`}>
                Booked seats by session date. Dashed line = STUDIO_MAX_SEATS_PER_DAY constant -- update once real capacity is confirmed.
              </p>
            </div>
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
              <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 mb-4`}>New vs. returning over time</p>
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
                {`Repeat rate computed from email identity, not the self-reported "Returning Customer" source label.
                Cohort retention = % of first-time customers in that month who made at least one additional booking.`}
              </p>
            </div>
          </Section>

          {/* Out of scope note */}
          <div className="rounded-2xl border border-black/8 bg-neutral-50 px-5 py-4">
            <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-400 mb-0.5`}>Not shown here: product revenue</p>
            <p className={`${vulfMono.className} text-xs text-neutral-400`}>
              Wood and leather product sales come from Square POS and are tracked in Domo. Only Stripe entry-fee revenue is shown above.
            </p>
          </div>

        </div>
      )}
    </section>
  );
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export default function ReportingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);
  if (!token) return null;
  return <ReportingDashboard token={token} />;
}
