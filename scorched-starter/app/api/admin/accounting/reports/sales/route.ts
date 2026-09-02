// app/api/admin/accounting/reports/sales/route.ts
// Sales & Products reporting: daily/day-of-week revenue come straight from
// revenue_settlements (settle_date, net_sales) — no need to touch the raw
// order data for those. Order-level stats (total orders, avg order value,
// avg items/order, top items) require iterating each day's stored Square
// orders, which only exist for real daily settlements (2026-06-03
// onward) — the Jan-May CSV-backfill rows have no `raw.orders`, so those
// five months are excluded from every metric here, not just under-counted.
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

    // Daily revenue + day-of-week: every settlement row qualifies, backfill included.
    const daily = rows.map((r) => ({ date: r.settle_date, netSales: Number(r.net_sales) }));
    const byDow = new Map<number, number>();
    for (const r of rows) {
      const dow = new Date(r.settle_date + "T12:00:00Z").getUTCDay();
      byDow.set(dow, (byDow.get(dow) ?? 0) + Number(r.net_sales));
    }
    const revenueByDayOfWeek = DOW_NAMES.map((name, i) => ({ day: name, revenue: byDow.get(i) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // Order-level stats: only rows with real Square order data (excludes
    // the Jan-May CSV backfill, whose raw is just a source marker).
    let totalOrders = 0;
    let totalItems = 0;
    let totalOrderRevenueCents = 0;
    const itemRevenueCents = new Map<string, number>();
    let daysWithOrderData = 0;

    for (const r of rows) {
      const raw = r.raw as SettlementRaw;
      if (!raw?.orders?.length) continue;
      daysWithOrderData++;
      for (const order of raw.orders) {
        if (order.state !== "COMPLETED") continue;
        totalOrders++;
        let orderCents = 0;
        for (const li of order.line_items ?? []) {
          const qty = parseFloat(li.quantity ?? "1") || 1;
          const cents = li.gross_sales_money?.amount ?? 0;
          totalItems += qty;
          orderCents += cents;
          const name = li.name ?? "(unnamed item)";
          itemRevenueCents.set(name, (itemRevenueCents.get(name) ?? 0) + cents);
        }
        totalOrderRevenueCents += orderCents;
      }
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
      dataStartsAt: "2026-06-03",
      orderDataNote: "Order-level stats (orders, avg order value, items/order, top items) only cover days with real Square order data — the Jan-May CSV backfill has revenue totals only, no line items.",
    });
  } catch (err) {
    console.error("ACCOUNTING_REPORTS_SALES_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
