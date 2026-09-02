"use client";

// Booking-derived helpers shared by the Overview / Marketing / Capacity tabs.
// Relocated from the old standalone Overview page (app/admin/reporting/page.tsx
// before the Financials merge) — logic unchanged except where noted.

import { vulfMono } from "@/app/fonts";
import type { BookingRecord } from "@/lib/supabase";

// ── Source config ─────────────────────────────────────────────────────────────

export const REFERRAL_OPTIONS = [
  "Get Out Pass",
  "Family/Friend",
  "TikTok",
  "In-Person/Drive by",
  "Returning Customer",
  "Instagram",
  "Google Search/Maps",
  "Other",
];

export const SOURCE_COLORS: Record<string, string> = {
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

export type TimeFrame = "week" | "month" | "year";
export type BookingLocation = "all" | "orem" | "slc";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function getBuckets(tf: TimeFrame): { key: string; label: string }[] {
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

export function bucketKey(createdAt: string, tf: TimeFrame): string {
  const d = new Date(createdAt);
  if (tf === "week") return toDateStr(d);
  if (tf === "year") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const sun = addDays(d, -d.getDay());
  sun.setHours(0, 0, 0, 0);
  return toDateStr(sun);
}

export function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function fmtPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function parseSlotMinutes(slot: string): number {
  const [time, ampm = "AM"] = slot.trim().split(" ");
  const [h, m = 0] = time.split(":").map(Number);
  const hours = ampm.toUpperCase() === "PM" && h !== 12 ? h + 12 : ampm.toUpperCase() === "AM" && h === 12 ? 0 : h;
  return hours * 60 + m;
}

// ── Shared tooltip for booking-count charts ───────────────────────────────────

export function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  // Biggest first, so the eye lands on what matters.
  const items = [...payload].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
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

// ── Timeframe toggle ──────────────────────────────────────────────────────────

export function TfToggle({ value, onChange }: { value: TimeFrame; onChange: (tf: TimeFrame) => void }) {
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

export function buildSourceChart(bookings: BookingRecord[], tf: TimeFrame, active: Set<string>) {
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

export function buildCapacityData(bookings: BookingRecord[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const seatsByDate: Record<string, number> = {};
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    seatsByDate[b.date] = (seatsByDate[b.date] ?? 0) + b.party_size;
  }
  // Extend the series 6 days before the visible window so the 7-day rolling
  // average is computed from real data on the first visible day too.
  const LOOKBACK = 6;
  const series = Array.from({ length: days + LOOKBACK }, (_, i) => {
    const d = addDays(today, i - (days + LOOKBACK - 1));
    return { d, seats: seatsByDate[toDateStr(d)] ?? 0 };
  });
  return series.slice(LOOKBACK).map((row, i) => {
    const win = series.slice(i, i + LOOKBACK + 1); // this day + previous 6
    const avg7 = win.reduce((s, r) => s + r.seats, 0) / win.length;
    return {
      label: row.d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      seats: row.seats,
      avg7: Math.round(avg7 * 10) / 10,
    };
  });
}

export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

export function buildHeatmap(bookings: BookingRecord[]) {
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

export type Tagged = BookingRecord & { isReturning: boolean };

// Strip formatting from a phone number; drop a leading US country code.
// Values under 7 digits are treated as junk (a partial or placeholder entry
// would otherwise glue unrelated customers together).
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

// Customer identity: two bookings belong to the same customer if their emails
// match OR their normalized phone numbers match (when both have one). This
// catches the common case of one person booking for a group under different
// guest emails but the same phone. Grouping is transitive (union-find), so
// email A + phone 1 and email B + phone 1 merge into one customer.
export function buildRepeatData(bookings: BookingRecord[]) {
  const confirmed = bookings.filter((b) => b.status === "confirmed");

  const parent = confirmed.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();
  confirmed.forEach((b, i) => {
    const email = b.email.toLowerCase().trim();
    if (email) {
      const prev = byEmail.get(email);
      if (prev == null) byEmail.set(email, i); else union(prev, i);
    }
    const phone = normalizePhone(b.phone);
    if (phone) {
      const prev = byPhone.get(phone);
      if (prev == null) byPhone.set(phone, i); else union(prev, i);
    }
  });

  const groups = new Map<number, BookingRecord[]>();
  confirmed.forEach((b, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(b); else groups.set(root, [b]);
  });
  const customers = [...groups.values()];
  for (const bs of customers) bs.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const firstIds = new Set(customers.map((bs) => bs[0].id));
  const tagged: Tagged[] = confirmed.map((b) => ({ ...b, isReturning: !firstIds.has(b.id) }));

  const uniqueCustomers = customers.length;
  const returningCustomers = customers.filter((bs) => bs.length > 1).length;

  const cohortMap: Record<string, { total: number; returned: number }> = {};
  for (const bs of customers) {
    const month = bs[0].created_at.slice(0, 7);
    if (!cohortMap[month]) cohortMap[month] = { total: 0, returned: 0 };
    cohortMap[month].total++;
    if (bs.length >= 2) cohortMap[month].returned++;
  }
  const cohortRows = Object.entries(cohortMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

  return { tagged, uniqueCustomers, returningCustomers, cohortRows };
}

export function buildRepeatChart(tagged: Tagged[], tf: TimeFrame) {
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

// ── Range filtering (bridges the Financials date-range picker to bookings) ────

/** Parse a rangeToQuery() string ("start=YYYY-MM-DD&end=YYYY-MM-DD" or "") into bounds. */
export function rangeBounds(query: string): { start?: string; end?: string } {
  const params = new URLSearchParams(query);
  return { start: params.get("start") ?? undefined, end: params.get("end") ?? undefined };
}

/** Bookings whose created_at date falls inside the page's selected range. */
export function bookingsInRange(bookings: BookingRecord[], query: string): BookingRecord[] {
  const { start, end } = rangeBounds(query);
  if (!start && !end) return bookings;
  return bookings.filter((b) => {
    const d = b.created_at.slice(0, 10);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

/** Referral source with the most confirmed bookings in the given list. */
export function topChannel(bookings: BookingRecord[]): { source: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const src = b.referral_source || "(not recorded)";
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  let best: { source: string; count: number } | null = null;
  for (const [source, count] of counts) {
    if (!best || count > best.count) best = { source, count };
  }
  return best;
}
