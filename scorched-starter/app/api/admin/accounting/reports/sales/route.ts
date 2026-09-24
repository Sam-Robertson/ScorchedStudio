// app/api/admin/accounting/reports/sales/route.ts
// Sales & Products reporting: daily/day-of-week revenue come straight from
// revenue_settlements (settle_date, net_sales). Order-level stats (total
// orders, avg order value, avg items/order, top items) come from each day's
// stored summary of its Square orders (raw.summary, see
// lib/accounting/settlement-summary.ts), never from the full order payload.
//
// Order-level figures are gross line-item sales (before discounts and
// refunds, gift card lines excluded); daily net sales are net of both. The
// UI labels them as such.
//
// No product "category" is buildable: Square line items only carry a
// catalog_object_id and a name, not a category. "Top items by revenue" (by
// item name) is the honest substitute.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { loadSquareSettlementSummaries } from "@/lib/accounting/settlement-summary-rows";

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const rows = await loadSquareSettlementSummaries(searchParams.get("start"), searchParams.get("end"));

    const daily = rows.map((r) => ({ date: r.settle_date, netSales: r.net_sales }));

    // Day-of-week only counts days with real order data (every row now, but
    // a lump-sum backfill would land on whatever weekday its date fell on).
    const byDow = new Map<number, number>();
    for (const r of rows) {
      if (r.summary.orders === 0) continue;
      const dow = new Date(r.settle_date + "T12:00:00Z").getUTCDay();
      byDow.set(dow, (byDow.get(dow) ?? 0) + r.net_sales);
    }
    const revenueByDayOfWeek = DOW_NAMES.map((name, i) => ({ day: name, revenue: byDow.get(i) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    let totalOrders = 0;
    let totalItems = 0;
    let totalOrderRevenueCents = 0;
    const itemRevenueCents = new Map<string, number>();
    const itemQty = new Map<string, number>();
    let daysWithOrderData = 0;
    const dailyOrderStats: { date: string; orders: number; items: number; avgOrderValue: number; grossOrderRevenue: number }[] = [];

    for (const r of rows) {
      const s = r.summary;
      if (s.orders === 0) continue;
      daysWithOrderData++;
      totalOrders += s.orders;
      totalItems += s.items;
      totalOrderRevenueCents += s.grossCents;
      for (const [name, cents] of Object.entries(s.itemRevenueCents)) itemRevenueCents.set(name, (itemRevenueCents.get(name) ?? 0) + cents);
      for (const [name, qty] of Object.entries(s.itemQty)) itemQty.set(name, (itemQty.get(name) ?? 0) + qty);
      dailyOrderStats.push({
        date: r.settle_date,
        orders: s.orders,
        items: s.items,
        avgOrderValue: Math.round(s.grossCents / s.orders) / 100,
        grossOrderRevenue: Math.round(s.grossCents) / 100,
      });
    }

    // Union of the top 15 by each metric: a cheap high-volume item can lead
    // on count while sitting outside the top 10 by revenue. The client sorts
    // by whichever metric is active and takes its own top 10.
    const allItems = [...itemRevenueCents.entries()].map(([name, cents]) => ({
      name,
      revenue: Math.round(cents) / 100,
      quantity: Math.round((itemQty.get(name) ?? 0) * 100) / 100,
    }));
    const topItems: typeof allItems = [];
    const seen = new Set<string>();
    for (const item of [
      ...[...allItems].sort((a, b) => b.revenue - a.revenue).slice(0, 15),
      ...[...allItems].sort((a, b) => b.quantity - a.quantity).slice(0, 15),
    ]) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      topItems.push(item);
    }

    return Response.json({
      daily,
      revenueByDayOfWeek,
      orderStats: {
        totalOrders,
        avgOrderValue: totalOrders > 0 ? Math.round(totalOrderRevenueCents / totalOrders) / 100 : 0,
        avgItemsPerOrder: totalOrders > 0 ? Math.round((totalItems / totalOrders) * 10) / 10 : 0,
        totalItems: Math.round(totalItems * 100) / 100,
        daysWithOrderData,
      },
      topItems,
      dailyOrderStats,
      dataStartsAt: "2025-08-02", // grand opening 2025-07-28; first Square order data lands a few days later
    });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_SALES_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
