// app/api/admin/accounting/reports/sales/route.ts
// Sales & Products reporting: daily/day-of-week revenue come straight from
// revenue_settlements (settle_date, net_sales) — no need to touch the raw
// order data for those. Order-level stats (total orders, avg order value,
// avg items/order, top items) require iterating each day's stored Square
// orders, which only exist for rows with a real daily settlement (every
// row now, after backfilling actual daily Square data back to the studio's
// 2025-07-28 grand opening — the original Jan-May 2026 CSV-lump rows this
// comment used to warn about have since been replaced with real per-day
// settlements).
//
// No product "category" is buildable: Square line items only carry a
// catalog_object_id and a name, not a category — that needs a separate
// Catalog API sync this system doesn't have. "Top items by revenue" (by
// item name) is the honest substitute.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

type SquareOrderLineItem = {
  name?: string;
  note?: string;
  quantity?: string;
  item_type?: string;
  gross_sales_money?: { amount?: number };
};
type SquareOrder = { state?: string; line_items?: SquareOrderLineItem[] };
type SettlementRaw = { orders?: SquareOrder[] };

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let query = sb
      .from("revenue_settlements")
      .select("settle_date, net_sales, raw")
      .eq("provider", "square")
      .order("settle_date");
    if (start) query = query.gte("settle_date", start);
    if (end) query = query.lte("settle_date", end);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];

    // Daily revenue: every settlement row qualifies, backfill included — a
    // whole month posted on the 1st is still a real day's worth of revenue
    // to plot, just concentrated on one point.
    const daily = rows.map((r) => ({ date: r.settle_date, netSales: Number(r.net_sales) }));

    // Day-of-week, however, breaks under that same backfill: each CSV month
    // lands entirely on whatever weekday the 1st happened to be, so e.g.
    // Sunday can show as the top revenue day for a studio that's closed
    // Sundays. Only real per-day settlements (raw.orders present) have a
    // day-of-week that means anything — same condition as the order-level
    // stats below.
    const byDow = new Map<number, number>();
    for (const r of rows) {
      const raw = r.raw as SettlementRaw;
      if (!raw?.orders?.length) continue;
      const dow = new Date(r.settle_date + "T12:00:00Z").getUTCDay();
      byDow.set(dow, (byDow.get(dow) ?? 0) + Number(r.net_sales));
    }
    const revenueByDayOfWeek = DOW_NAMES.map((name, i) => ({ day: name, revenue: byDow.get(i) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // Order-level stats: only rows with real Square order data. Every row
    // should have this now, but the check stays as a safety net in case a
    // future manual backfill ever posts a lump-sum entry again.
    let totalOrders = 0;
    let totalItems = 0;
    let totalOrderRevenueCents = 0;
    const itemRevenueCents = new Map<string, number>();
    let daysWithOrderData = 0;
    const dailyOrderStats: { date: string; orders: number; items: number; avgOrderValue: number }[] = [];

    for (const r of rows) {
      const raw = r.raw as SettlementRaw;
      if (!raw?.orders?.length) continue;
      daysWithOrderData++;
      let dayOrders = 0;
      let dayItems = 0;
      let dayCents = 0;
      for (const order of raw.orders) {
        if (order.state !== "COMPLETED") continue;
        totalOrders++;
        dayOrders++;
        let orderCents = 0;
        for (const li of order.line_items ?? []) {
          const qty = parseFloat(li.quantity ?? "1") || 1;
          const cents = li.gross_sales_money?.amount ?? 0;
          totalItems += qty;
          dayItems += qty;
          orderCents += cents;
          // Nameless line items are CUSTOM_AMOUNT register charges (ad-hoc
          // amounts rung up without a catalog item, e.g. private-session
          // pricing) — real sales, not a data error. Use the register note
          // when the cashier left one, else label them for what they are.
          const name = li.name ?? (li.note?.trim() || "Custom Amount");
          itemRevenueCents.set(name, (itemRevenueCents.get(name) ?? 0) + cents);
        }
        totalOrderRevenueCents += orderCents;
        dayCents += orderCents;
      }
      dailyOrderStats.push({
        date: r.settle_date,
        orders: dayOrders,
        items: dayItems,
        avgOrderValue: dayOrders > 0 ? Math.round(dayCents / dayOrders) / 100 : 0,
      });
    }

    const topItems = [...itemRevenueCents.entries()]
      .map(([name, cents]) => ({ name, revenue: Math.round(cents) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return Response.json({
      daily,
      revenueByDayOfWeek,
      orderStats: {
        totalOrders,
        avgOrderValue: totalOrders > 0 ? Math.round((totalOrderRevenueCents / totalOrders)) / 100 : 0,
        avgItemsPerOrder: totalOrders > 0 ? Math.round((totalItems / totalOrders) * 10) / 10 : 0,
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
