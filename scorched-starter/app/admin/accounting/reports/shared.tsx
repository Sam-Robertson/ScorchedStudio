"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { vulfMono } from "@/app/fonts";
import { AlertTriangle } from "lucide-react";

// ── Shared types (shapes of the three report API responses) ──────────────────

export type PlMonth = {
  period_month: string;
  location_id: string | null;
  revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  net_income: number;
};

export type PlLine = {
  period_month: string;
  location_id: string | null;
  code: string;
  name: string;
  type: string;
  amount: number;
};

export type PlResponse = { months: PlMonth[]; lines: PlLine[]; dataStartsAt?: string };

export type CostsResponse = {
  totals: { totalOperatingCosts: number; totalLaborCosts: number; totalCogs: number };
  breakdown: { code: string; name: string; amount: number }[];
  monthlyCategories: ({ period_month: string } & Record<string, number | string>)[];
  laborByMonth: { period_month: string; amount: number }[];
  dataStartsAt?: string;
};

export type SalesResponse = {
  daily: { date: string; netSales: number }[];
  revenueByDayOfWeek: { day: string; revenue: number }[];
  orderStats: { totalOrders: number; avgOrderValue: number; avgItemsPerOrder: number; daysWithOrderData: number };
  topItems: { name: string; revenue: number }[];
  dailyOrderStats: { date: string; orders: number; items: number; avgOrderValue: number }[];
  dataStartsAt?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// All three report APIs return this as `dataStartsAt`; used as the fallback
// while a response is still loading.
export const DATA_STARTS_AT = "2025-06-06";

export const BROWN = "#884A20";
export const GREEN = "#418A5C"; // chart-safe deep green, near brand #519A70
export const BLUE = "#3E6FA6";
export const GRAY = "#9CA3AF";

// Categorical palette for cost-category series, assigned by spend rank.
// Validated (lightness band, chroma floor, CVD adjacent-pair separation,
// normal-vision floor, contrast vs white) — do not reorder casually.
export const CHART_COLORS = [
  "#884A20", // brand brown
  "#418A5C", // deep green
  "#3E6FA6", // steel blue
  "#B08428", // ochre
  "#119595", // teal
  "#8B5CF6", // violet
  "#4292C6", // sky blue
  "#C25B5B", // soft red
  "#2F6BB0", // cobalt
];
export const OTHER_COLOR = GRAY; // reserved for the "Other" fold

export const AXIS_TICK = { fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: "#9ca3af" };
export const GRID_STROKE = "#f0f0f0";

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtMoney0(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtMoney2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtAxisMoney(n: number) {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `$${n}`;
}

export function fmtPct1(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

/** "2026-01-01" -> "Jan 26" */
export function monthShort(period_month: string) {
  return new Date(period_month.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** "2025-08-02" -> "Aug 2, 2025" */
export function dateLong(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2025-08-02" -> "Aug 2" */
export function dateShort(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Day-of-week index for a YYYY-MM-DD string — same UTC-noon trick the sales API uses. */
export function dowIndex(date: string) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Date-range filter ─────────────────────────────────────────────────────────

export type RangePreset = "3m" | "6m" | "ytd" | "all" | "custom";
export type RangeState = { preset: RangePreset; start?: string; end?: string };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthsBackStart(n: number) {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Query-string fragment ("start=...&end=..." or "") for the selected range. */
export function rangeToQuery(range: RangeState): string {
  if (range.preset === "all") return "";
  if (range.preset === "custom") {
    const parts: string[] = [];
    if (range.start) parts.push(`start=${range.start}`);
    if (range.end) parts.push(`end=${range.end}`);
    return parts.join("&");
  }
  const start = range.preset === "ytd" ? `${new Date().getFullYear()}-01-01`
    : range.preset === "6m" ? monthsBackStart(5)
    : monthsBackStart(2);
  return `start=${start}&end=${todayStr()}`;
}

const PRESET_LABEL: Record<Exclude<RangePreset, "custom">, string> = {
  "3m": "Last 3 mo",
  "6m": "Last 6 mo",
  ytd: "YTD",
  all: "All time",
};

export function DateRangeFilter({ value, onChange }: { value: RangeState; onChange: (r: RangeState) => void }) {
  const inputCls = `${vulfMono.className} text-xs border border-black/20 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-black/40`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-black/15 overflow-hidden">
        {(["3m", "6m", "ytd", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onChange({ preset: p })}
            className={`${vulfMono.className} px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              value.preset === p ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
        <button
          onClick={() => onChange({ preset: "custom", start: value.start, end: value.end })}
          className={`${vulfMono.className} px-3 py-1.5 text-xs transition-colors ${
            value.preset === "custom" ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          Custom
        </button>
      </div>
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className={inputCls}
            value={value.start ?? ""}
            onChange={(e) => onChange({ preset: "custom", start: e.target.value || undefined, end: value.end })}
            aria-label="Start date"
          />
          <span className={`${vulfMono.className} text-xs text-neutral-400`}>to</span>
          <input
            type="date"
            className={inputCls}
            value={value.end ?? ""}
            onChange={(e) => onChange({ preset: "custom", start: value.start, end: e.target.value || undefined })}
            aria-label="End date"
          />
        </div>
      )}
    </div>
  );
}

// ── Data fetching ─────────────────────────────────────────────────────────────

export function useRangedReport<T>(path: string, token: string, query: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const url = query ? `${path}?${query}` : path;

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.error) throw new Error(json.error);
        setData(json as T);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, token]);

  useEffect(() => load(), [load]);
  return { data, loading, error };
}

export function LoadingOrError({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>;
  return null;
}

// ── P&L month/line merging ────────────────────────────────────────────────────
// The P&L view groups by (month, location); most bank-rule postings carry no
// location_id while revenue settlements do, so a month can arrive split into
// two rows. Merge by month, same as the legacy PlView.

export function mergePlMonths(months: PlMonth[]): PlMonth[] {
  const byMonth = new Map<string, PlMonth>();
  for (const m of months) {
    const existing = byMonth.get(m.period_month);
    if (!existing) {
      byMonth.set(m.period_month, { ...m, location_id: null });
      continue;
    }
    existing.revenue += m.revenue;
    existing.cogs += m.cogs;
    existing.gross_profit += m.gross_profit;
    existing.operating_expenses += m.operating_expenses;
    existing.ebitda += m.ebitda;
    existing.depreciation += m.depreciation;
    existing.interest += m.interest;
    existing.net_income += m.net_income;
  }
  return [...byMonth.values()].sort((a, b) => a.period_month.localeCompare(b.period_month));
}

/** Sum of `lines` amounts for the given account codes, per month. */
export function sumLinesByMonth(lines: PlLine[], codes: string[]): Map<string, number> {
  const set = new Set(codes);
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!set.has(l.code)) continue;
    out.set(l.period_month, (out.get(l.period_month) ?? 0) + l.amount);
  }
  return out;
}

/** Drop trailing months with no activity at all (e.g. the just-started current month). */
export function dropEmptyTrailingMonths(months: PlMonth[]): PlMonth[] {
  const out = [...months];
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.revenue === 0 && last.cogs === 0 && last.operating_expenses === 0 && last.net_income === 0) out.pop();
    else break;
  }
  return out;
}

// ── UI building blocks (mirroring app/admin/reporting/page.tsx) ───────────────

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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

export function KpiCard({ label, value, sub, valueColor, onClick, selected }: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const base = "rounded-2xl border bg-white shadow-sm px-5 py-4 text-left w-full transition-all";
  const border = selected
    ? "border-[#884A20] ring-1 ring-[#884A20]/40 bg-[#884A20]/[0.04]"
    : "border-black/10" + (onClick ? " hover:border-black/25" : "");
  const inner = (
    <>
      <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 mb-1`}>{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: valueColor ?? "#171717" }}>{value}</p>
      {sub && <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} ${border} cursor-pointer`} aria-pressed={selected}>
        {inner}
      </button>
    );
  }
  return <div className={`${base} ${border}`}>{inner}</div>;
}

// ── Shared money tooltip for charts ───────────────────────────────────────────

type TooltipEntry = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string; fill?: string };

export function MoneyTooltip({ active, payload, label, showTotal }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  showTotal?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const items = [...payload].reverse().filter((p) => typeof p.value === "number" && p.value !== 0);
  if (!items.length) return null;
  const total = items.reduce((s, p) => s + (p.value as number), 0);
  return (
    <div style={{ fontFamily: "var(--font-display,monospace)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "10px 14px", minWidth: 180 }}>
      <p style={{ fontWeight: "bold", marginBottom: 6, color: "#374151" }}>
        {label}
        {showTotal && items.length > 1 && (
          <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>({fmtMoney0(total)})</span>
        )}
      </p>
      {items.map((item, i) => (
        <p key={i} style={{ padding: "2px 0", display: "flex", alignItems: "center", gap: 6, color: "#4b5563" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: item.color ?? item.fill ?? "#888", flexShrink: 0 }} />
          <span>{String(item.name ?? item.dataKey)}:</span>
          <span style={{ fontWeight: 700 }}>{fmtMoney0(item.value as number)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Data-gap banner ───────────────────────────────────────────────────────────
// After extending Plaid's history (re-link, Sept 2026) and backfilling real
// daily Square settlements back to the studio's actual grand opening, there's
// no meaningful data gap left within the ledger's history — bank/card data
// starts 2025-06-06, and Square order data starts 2025-08-02 (a few days
// after the 2025-07-28 grand opening). What's left to flag is informational,
// not a warning: revenue is genuinely $0 before the opening (pre-launch
// build-out), not missing data, and anything before the bank data's own
// start (2025-06-06) simply isn't in this ledger at all.

export const GRAND_OPENING_AT = "2025-07-28";
export const BANK_DATA_STARTS_AT = "2025-06-06";

export function DataGapBanner({ dataStartsAt }: { dataStartsAt?: string }) {
  const bankStart = dateLong(dataStartsAt ?? DATA_STARTS_AT);
  const opening = dateLong(GRAND_OPENING_AT);
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-5 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Ledger history starts {bankStart}</p>
        <p className="text-sm text-amber-700 mt-1">
          Bank and card data goes back to {bankStart}. Revenue is genuinely $0 before the studio&apos;s grand opening
          on {opening} — that&apos;s real pre-launch history (build-out costs, no sales yet), not missing data.
          Nothing before {bankStart} is in this ledger at all.
        </p>
      </div>
    </div>
  );
}
