"use client";

// app/admin/reporting/page.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import type { BookingRecord } from "@/lib/supabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

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

type TimeFrame = "week" | "month" | "year";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Build bucket keys and labels for each time frame
function getBuckets(tf: TimeFrame): { key: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (tf === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return {
        key: toDateStr(d),
        label: d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
      };
    });
  }

  if (tf === "month") {
    // Last 8 weeks (Sunday-based weekly buckets)
    const buckets: { key: string; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = addDays(today, -(i * 7 + today.getDay()));
      buckets.push({
        key: toDateStr(weekStart),
        label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    return buckets;
  }

  // year — last 12 months
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    };
  });
}

// Assign a booking's created_at to a bucket key
function bucketKey(createdAt: string, tf: TimeFrame): string {
  const d = new Date(createdAt);
  if (tf === "week") return toDateStr(d);
  if (tf === "year") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // month: find the Sunday on or before this date
  const dayOfWeek = d.getDay();
  const sunday = addDays(d, -dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  return toDateStr(sunday);
}

// ── Build chart data ──────────────────────────────────────────────────────────

function buildChartData(
  bookings: BookingRecord[],
  tf: TimeFrame,
  activeSources: Set<string>
): { label: string; [source: string]: number | string }[] {
  const buckets = getBuckets(tf);
  const bucketSet = new Set(buckets.map((b) => b.key));

  // Initialise each bucket with 0 for every active source
  const map: Record<string, Record<string, number>> = {};
  for (const b of buckets) {
    map[b.key] = {};
    for (const src of activeSources) map[b.key][src] = 0;
  }

  // Count bookings into buckets
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const src = b.referral_source || "(not recorded)";
    if (!activeSources.has(src)) continue;
    const key = bucketKey(b.created_at, tf);
    if (!bucketSet.has(key)) continue;
    map[key][src] = (map[key][src] ?? 0) + 1;
  }

  return buckets.map(({ key, label }) => ({ label, ...map[key] }));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <ReportingDashboard token={token} />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function ReportingDashboard({ token }: { token: string }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("month");
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/bookings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => { setBookings(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const confirmed = useMemo(() => bookings.filter((b) => b.status === "confirmed"), [bookings]);

  // All sources that appear in the data
  const presentSources = useMemo(() => {
    const seen = new Set<string>();
    for (const b of confirmed) seen.add(b.referral_source || "(not recorded)");
    // Return in canonical order, then anything extra
    return [
      ...REFERRAL_OPTIONS.filter((o) => seen.has(o)),
      ...[...seen].filter((s) => !REFERRAL_OPTIONS.includes(s)),
    ];
  }, [confirmed]);

  const activeSources = useMemo(
    () => new Set(presentSources.filter((s) => !hiddenSources.has(s))),
    [presentSources, hiddenSources]
  );

  const chartData = useMemo(
    () => buildChartData(confirmed, timeFrame, activeSources),
    [confirmed, timeFrame, activeSources]
  );

  // All-time breakdown table
  const { rows, otherDetails } = useMemo(() => {
    const counts: Record<string, number> = {};
    const details: string[] = [];
    for (const b of confirmed) {
      const src = b.referral_source || "(not recorded)";
      counts[src] = (counts[src] ?? 0) + 1;
      if (b.referral_source === "Other" && b.referral_other) details.push(b.referral_other);
    }
    const sorted = [
      ...REFERRAL_OPTIONS.filter((o) => counts[o] !== undefined).map((o) => ({ label: o, count: counts[o] })),
      ...Object.entries(counts)
        .filter(([k]) => !REFERRAL_OPTIONS.includes(k))
        .map(([k, v]) => ({ label: k, count: v }))
        .sort((a, b) => b.count - a.count),
    ];
    return { rows: sorted, otherDetails: details };
  }, [confirmed]);

  const total = confirmed.length;

  function toggleSource(src: string) {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) { next.delete(src); } else { next.add(src); }
      return next;
    });
  }

  return (
    <section className="container-px py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Reporting</h1>
          {!loading && !error && (
            <p className={`${vulfMono.className} text-sm text-neutral-500 mt-1`}>
              {total} confirmed booking{total !== 1 ? "s" : ""} total
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
            ← Admin
          </a>
          <button
            onClick={() => { sessionStorage.removeItem("adminToken"); window.location.href = "/admin"; }}
            className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
          >
            Log out
          </button>
        </div>
      </div>

      {loading && <p className={`${vulfMono.className} text-sm text-neutral-500 py-10 text-center`}>Loading…</p>}
      {error && <p className="text-sm text-red-600 py-10 text-center">Error: {error}</p>}

      {!loading && !error && (
        <div className="space-y-6">

          {/* ── Line chart ── */}
          <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-black/10">
              <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>
                Referral sources over time
              </p>
              {/* Time frame toggle */}
              <div className="flex rounded-lg border border-black/15 overflow-hidden self-start sm:self-auto">
                {(["week", "month", "year"] as TimeFrame[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFrame(tf)}
                    className={`${vulfMono.className} px-4 py-1.5 text-xs capitalize transition-colors ${
                      timeFrame === tf
                        ? "bg-[#884A20] text-white"
                        : "text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {presentSources.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>
                No referral data yet.
              </p>
            ) : (
              <div className="px-2 pt-6 pb-4">
                {/* Source toggles */}
                <div className="flex flex-wrap gap-2 px-4 mb-5">
                  {presentSources.map((src) => {
                    const active = !hiddenSources.has(src);
                    const color = SOURCE_COLORS[src] ?? "#888";
                    return (
                      <button
                        key={src}
                        onClick={() => toggleSource(src)}
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all ${
                          active ? "border-transparent text-white" : "border-black/15 text-neutral-400 bg-white"
                        }`}
                        style={active ? { backgroundColor: color } : {}}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : color }}
                        />
                        {src}
                      </button>
                    );
                  })}
                </div>

                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fontFamily: "var(--font-vulg-mono, monospace)", fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fontFamily: "var(--font-vulg-mono, monospace)", fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        fontFamily: "var(--font-vulg-mono, monospace)",
                        fontSize: 12,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.08)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                      }}
                      itemStyle={{ padding: "2px 0" }}
                      labelStyle={{ fontWeight: "bold", marginBottom: 4 }}
                    />
                    <Legend
                      wrapperStyle={{ display: "none" }}
                    />
                    {[...activeSources].map((src) => (
                      <Line
                        key={src}
                        type="monotone"
                        dataKey={src}
                        stroke={SOURCE_COLORS[src] ?? "#888"}
                        strokeWidth={2}
                        dot={{ r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── All-time breakdown table ── */}
          <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-black/10">
              <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-500`}>
                All-time breakdown
              </p>
            </div>

            {total === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-8 text-center`}>
                No confirmed bookings with referral data yet.
              </p>
            ) : (
              <div className="px-6 py-5">
                <table className={`${vulfMono.className} w-full text-sm`}>
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                      <th className="pb-3 font-medium">Source</th>
                      <th className="pb-3 font-medium text-right">Count</th>
                      <th className="pb-3 font-medium text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ label, count }) => {
                      const pct = Math.round((count / total) * 100);
                      const color = SOURCE_COLORS[label] ?? "#888";
                      return (
                        <tr key={label} className="border-b border-black/5 last:border-0">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-neutral-800">{label}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right text-neutral-600 font-medium">{count}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <div className="hidden sm:block w-24 h-1.5 rounded-full bg-black/5 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-neutral-400 tabular-nums w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {otherDetails.length > 0 && (
                  <details className="mt-5">
                    <summary className={`${vulfMono.className} text-xs text-neutral-400 cursor-pointer hover:text-neutral-600`}>
                      &ldquo;Other&rdquo; responses ({otherDetails.length})
                    </summary>
                    <ul className="mt-3 space-y-1.5">
                      {otherDetails.map((d, i) => (
                        <li key={i} className={`${vulfMono.className} text-xs text-neutral-600 pl-3 border-l-2 border-black/10`}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
