"use client";

// Compact daily order detail: shows the last 15 days of order data by default
// (a fixed recent window, independent of the page-wide date-range selector),
// with a date picker to jump to a specific day. Rendered inside Sales &
// Products behind its disclosure toggle.

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  SalesResponse, useRangedReport, LoadingOrError, Section,
  fmtMoney0, fmtMoney2, dateShort, dateLong, dowIndex, DOW_NAMES,
} from "./shared";

const RECENT_DAYS = 15;   // default window: the 15 most recent days with data
const JUMP_PAD_DAYS = 3;  // jump mode: the picked day ± this many days

type Row = { date: string; dow: number; orders: number; items: number; netSales: number | null; avgOrderValue: number };
type SortCol = "date" | "dow" | "orders" | "items" | "netSales" | "aov";
type SortDir = "desc" | "asc";

function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SpDetailsView({ token }: { token: string }) {
  // Deliberately unranged: this table has its own fixed recent window plus a
  // jump-to-date control, so it needs the full history available client-side.
  const { data, loading, error } = useRangedReport<SalesResponse>("/api/admin/accounting/reports/sales", token, "");
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [jumpDate, setJumpDate] = useState("");

  const allRows = useMemo<Row[]>(() => {
    const salesByDate = new Map((data?.daily ?? []).map((d) => [d.date, d.netSales]));
    return (data?.dailyOrderStats ?? []).map((d) => ({
      date: d.date,
      dow: dowIndex(d.date),
      orders: d.orders,
      items: d.items,
      netSales: salesByDate.get(d.date) ?? null,
      avgOrderValue: d.avgOrderValue,
    }));
  }, [data]);

  const rows = useMemo<Row[]>(() => {
    let subset: Row[];
    if (jumpDate) {
      const from = shiftDate(jumpDate, -JUMP_PAD_DAYS);
      const to = shiftDate(jumpDate, JUMP_PAD_DAYS);
      subset = allRows.filter((r) => r.date >= from && r.date <= to);
    } else {
      subset = [...allRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_DAYS);
    }
    const out = [...subset];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date") cmp = a.date.localeCompare(b.date);
      else if (sortCol === "dow") cmp = a.dow - b.dow;
      else if (sortCol === "orders") cmp = a.orders - b.orders;
      else if (sortCol === "items") cmp = a.items - b.items;
      else if (sortCol === "netSales") cmp = (a.netSales ?? -1) - (b.netSales ?? -1);
      else cmp = a.avgOrderValue - b.avgOrderValue;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out;
  }, [allRows, jumpDate, sortCol, sortDir]);

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ orders: t.orders + r.orders, items: t.items + r.items, netSales: t.netSales + (r.netSales ?? 0) }),
    { orders: 0, items: 0, netSales: 0 },
  ), [rows]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
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
        <Section
          title="Daily Order Detail"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${vulfMono.className} text-xs text-neutral-400`}>Jump to date</label>
              <input
                type="date"
                value={jumpDate}
                onChange={(e) => setJumpDate(e.target.value)}
                className={`${vulfMono.className} text-xs border border-black/20 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-black/40`}
                aria-label="Jump to date"
              />
              {jumpDate && (
                <button
                  onClick={() => setJumpDate("")}
                  className={`${vulfMono.className} text-xs text-neutral-500 border border-black/15 rounded-lg px-3 py-1.5 hover:bg-neutral-50`}
                >
                  Show recent
                </button>
              )}
            </div>
          }
        >
          {rows.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>
              {jumpDate ? `No order data around ${dateLong(jumpDate)}.` : "No order data yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${vulfMono.className} w-full min-w-[720px] text-sm`}>
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                    <Th label="Date" col="date" />
                    <Th label="Day" col="dow" />
                    <Th label="Orders" col="orders" right />
                    <Th label="Items" col="items" right />
                    <Th label="Net Sales" col="netSales" right />
                    <Th label="Avg Order Value" col="aov" right />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className="border-b border-black/5 hover:bg-neutral-50/60">
                      <td className="px-4 py-2.5 font-semibold text-neutral-800 whitespace-nowrap">{dateShort(r.date)}</td>
                      <td className="px-4 py-2.5 text-neutral-500">{DOW_NAMES[r.dow].slice(0, 3)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{r.orders}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{r.items}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">
                        {r.netSales == null ? "—" : fmtMoney0(r.netSales)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">{fmtMoney2(r.avgOrderValue)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-black/15 bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-bold text-neutral-800 uppercase text-xs tracking-wide" colSpan={2}>
                      Total ({rows.length} days)
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-800">{totals.orders.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">{totals.items.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-800">{fmtMoney0(totals.netSales)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-700">
                      {totals.orders > 0 ? fmtMoney2(totals.netSales / totals.orders) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 py-3`}>
                {jumpDate
                  ? `Showing ${dateLong(jumpDate)} ± ${JUMP_PAD_DAYS} days.`
                  : `The last ${RECENT_DAYS} days with Square order data (independent of the page's date range).`}
                {" "}Net Sales joined from the daily revenue series by date. Click a column header to sort.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
