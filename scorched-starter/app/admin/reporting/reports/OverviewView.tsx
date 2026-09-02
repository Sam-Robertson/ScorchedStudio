"use client";

// Overview tab — at-a-glance triage across everything on this page. KPI cards
// only; every metric has its detailed home in another tab (P&L, Marketing,
// Capacity), so this tab stays shallow on purpose.

import { useMemo } from "react";
import type { BookingRecord } from "@/lib/supabase";
import {
  PlResponse, CostsResponse, useRangedReport, KpiCard,
  mergePlMonths, dropEmptyTrailingMonths, fmtMoney0,
} from "./shared";
import {
  bookingsInRange, topChannel, buildRepeatData, fmtPct, toDateStr, addDays,
} from "./bookingShared";

const MARKETING_CODE = "6200";
const RED = "#C25B5B";
const GREEN = "#418A5C";

export default function OverviewView({ token, query, bookings, bookingsLoading, costs, costsLoading }: {
  token: string;
  query: string;
  bookings: BookingRecord[];
  bookingsLoading: boolean;
  costs: CostsResponse | null;
  costsLoading: boolean;
}) {
  // Same P&L source PlOverviewView uses — full ledger revenue, not Stripe-only.
  const { data: pl, loading: plLoading } = useRangedReport<PlResponse>("/api/admin/accounting/reports/pl", token, query);

  const plTotals = useMemo(() => {
    const months = dropEmptyTrailingMonths(mergePlMonths(pl?.months ?? []));
    return {
      revenue: months.reduce((s, m) => s + m.revenue, 0),
      netIncome: months.reduce((s, m) => s + m.net_income, 0),
    };
  }, [pl]);

  const marketingSpend = useMemo(
    () => (costs?.breakdown ?? []).filter((b) => b.code === MARKETING_CODE).reduce((s, b) => s + b.amount, 0),
    [costs],
  );

  const confirmed = useMemo(() => bookings.filter((b) => b.status === "confirmed"), [bookings]);
  const top = useMemo(() => topChannel(bookingsInRange(confirmed, query)), [confirmed, query]);

  // Booked seats: this week's total (by session date) vs. the prior week.
  const seatsTrend = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thisWeekStart = toDateStr(addDays(today, -6));
    const todayStr = toDateStr(today);
    const lastWeekStart = toDateStr(addDays(today, -13));
    const lastWeekEnd = toDateStr(addDays(today, -7));
    let thisWeek = 0, lastWeek = 0;
    for (const b of confirmed) {
      if (b.date >= thisWeekStart && b.date <= todayStr) thisWeek += b.party_size;
      else if (b.date >= lastWeekStart && b.date <= lastWeekEnd) lastWeek += b.party_size;
    }
    const deltaPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
    return { thisWeek, lastWeek, deltaPct };
  }, [confirmed]);

  const { uniqueCustomers, returningCustomers } = useMemo(() => buildRepeatData(bookings), [bookings]);
  const repeatRate = uniqueCustomers > 0 ? returningCustomers / uniqueCustomers : 0;

  const seatsSub = seatsTrend.deltaPct == null
    ? "no seats booked last week"
    : `${seatsTrend.deltaPct >= 0 ? "+" : ""}${seatsTrend.deltaPct}% vs last week`;
  const seatsSubColor = seatsTrend.deltaPct == null ? undefined
    : seatsTrend.deltaPct >= 0 ? GREEN : RED;

  const busy = plLoading || costsLoading || bookingsLoading;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label="Net Revenue"
          value={plLoading ? "…" : fmtMoney0(plTotals.revenue)}
          sub="full ledger, selected range — detail in P&L"
        />
        <KpiCard
          label="Net Profit"
          value={plLoading ? "…" : fmtMoney0(plTotals.netIncome)}
          valueColor={!plLoading && plTotals.netIncome < 0 ? RED : GREEN}
          sub="after all costs — detail in P&L"
        />
        <KpiCard
          label="Marketing Spend"
          value={costsLoading ? "…" : fmtMoney0(marketingSpend)}
          sub="selected range — detail in Marketing"
        />
        <KpiCard
          label="Top Channel"
          value={bookingsLoading ? "…" : top ? top.source : "—"}
          sub={top ? `${top.count} confirmed bookings in range` : "how customers found us"}
        />
        <KpiCard
          label="Booked Seats This Week"
          value={bookingsLoading ? "…" : seatsTrend.thisWeek.toLocaleString()}
          sub={bookingsLoading ? undefined : seatsSub}
          subColor={seatsSubColor}
        />
        <KpiCard
          label="Repeat Customer Rate"
          value={bookingsLoading ? "…" : fmtPct(repeatRate)}
          sub={`${returningCustomers} of ${uniqueCustomers} customers booked again`}
        />
      </div>
      {!busy && (
        <p className="text-xs text-neutral-400">
          Each number has a detailed home in another tab — P&amp;L for revenue and profit, Marketing for spend and
          channels, Capacity for bookings and repeat behavior.
        </p>
      )}
    </div>
  );
}
