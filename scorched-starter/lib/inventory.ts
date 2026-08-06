// lib/inventory.ts — server-only data layer for inventory items, the stock
// ledger, purchase orders, and the monthly Square sales upload.
import { getSupabase } from "@/lib/supabase";
import { daysInMonthKey, daysSinceDenver, previousMonthKey } from "@/lib/timezone";

export type InventoryItemRecord = {
  id: string;
  name: string;
  sku: string | null;
  safety_buffer_units: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderRecord = {
  id: string;
  item_id: string;
  quantity_ordered: number | null;
  order_date: string;
  arrival_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryLedgerRecord = {
  id: string;
  item_id: string;
  delta: number;
  reason: string;
  created_at: string;
};

export type ItemStatus = "reorder_now" | "ok" | "no_lead_time_data";

export type ItemWithStats = InventoryItemRecord & {
  on_hand_qty: number;
  prior_month_key: string;
  prior_month_units_sold: number | null;
  prior_month_daily_avg: number;
  all_time_daily_avg: number;
  demand_rate: number;
  lead_time_days: number | null;
  reorder_point: number | null;
  status: ItemStatus;
  open_purchase_orders: PurchaseOrderRecord[];
};

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<{ id: string; tracking_start_date: string }> {
  const { data, error } = await getSupabase()
    .from("inventory_settings")
    .select("*")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTrackingStartDate(trackingStartDate: string): Promise<void> {
  const { id } = await getSettings();
  const { error } = await getSupabase()
    .from("inventory_settings")
    .update({ tracking_start_date: trackingStartDate })
    .eq("id", id);
  if (error) throw error;
}

// ── Items + computed stats ───────────────────────────────────────────────────

export async function getItemsWithStats(): Promise<ItemWithStats[]> {
  const supabase = getSupabase();
  const [{ data: items, error: itemsErr }, { data: ledger, error: ledgerErr }, { data: pos, error: posErr }, settings] =
    await Promise.all([
      supabase.from("inventory_items").select("*").order("name"),
      supabase.from("inventory_stock_ledger").select("*"),
      supabase.from("inventory_purchase_orders").select("*"),
      getSettings(),
    ]);
  if (itemsErr) throw itemsErr;
  if (ledgerErr) throw ledgerErr;
  if (posErr) throw posErr;

  const priorMonthKey = previousMonthKey();
  const priorMonthReason = `sales:${priorMonthKey}`;
  const daysSinceTrackingStart = Math.max(1, daysSinceDenver(settings.tracking_start_date));

  return (items as InventoryItemRecord[]).map((item) => {
    const itemLedger = (ledger as InventoryLedgerRecord[]).filter((l) => l.item_id === item.id);
    const itemPos = (pos as PurchaseOrderRecord[]).filter((p) => p.item_id === item.id);

    const on_hand_qty = itemLedger.reduce((sum, l) => sum + l.delta, 0);

    const priorMonthRow = itemLedger.find((l) => l.reason === priorMonthReason);
    const prior_month_units_sold = priorMonthRow ? -priorMonthRow.delta : null;
    const prior_month_daily_avg =
      prior_month_units_sold !== null ? prior_month_units_sold / daysInMonthKey(priorMonthKey) : 0;

    const allTimeUnitsSold = itemLedger
      .filter((l) => l.reason.startsWith("sales:"))
      .reduce((sum, l) => sum - l.delta, 0);
    const all_time_daily_avg = allTimeUnitsSold / daysSinceTrackingStart;

    const demand_rate = Math.max(prior_month_daily_avg, all_time_daily_avg);

    const completedPos = itemPos.filter((p) => p.arrival_date);
    const lead_time_days =
      completedPos.length > 0
        ? completedPos.reduce((sum, p) => sum + daysBetween(p.order_date, p.arrival_date!), 0) / completedPos.length
        : null;

    const reorder_point =
      lead_time_days !== null ? Math.ceil(demand_rate * lead_time_days) + item.safety_buffer_units : null;

    const status: ItemStatus =
      reorder_point === null ? "no_lead_time_data" : on_hand_qty <= reorder_point ? "reorder_now" : "ok";

    return {
      ...item,
      on_hand_qty,
      prior_month_key: priorMonthKey,
      prior_month_units_sold,
      prior_month_daily_avg,
      all_time_daily_avg,
      demand_rate,
      lead_time_days,
      reorder_point,
      status,
      open_purchase_orders: itemPos.filter((p) => !p.arrival_date),
    };
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export async function createItem(input: {
  name: string;
  sku: string | null;
  safety_buffer_units: number;
}): Promise<InventoryItemRecord> {
  const { data, error } = await getSupabase()
    .from("inventory_items")
    .insert({ name: input.name.trim(), sku: input.sku?.trim() || null, safety_buffer_units: input.safety_buffer_units })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<InventoryItemRecord, "name" | "sku" | "safety_buffer_units" | "active">>
): Promise<InventoryItemRecord> {
  const { data, error } = await getSupabase()
    .from("inventory_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Physical counts ───────────────────────────────────────────────────────────

export async function recordCount(itemId: string, countedQty: number): Promise<void> {
  const supabase = getSupabase();
  const { data: ledger, error: ledgerErr } = await supabase
    .from("inventory_stock_ledger")
    .select("delta")
    .eq("item_id", itemId);
  if (ledgerErr) throw ledgerErr;

  const currentOnHand = (ledger ?? []).reduce((sum, l) => sum + l.delta, 0);
  const delta = countedQty - currentOnHand;

  const { error } = await supabase.from("inventory_stock_ledger").insert({
    item_id: itemId,
    delta,
    reason: `count:${new Date().toISOString()}`,
  });
  if (error) throw error;
}

// ── Purchase orders ───────────────────────────────────────────────────────────

export async function createPurchaseOrder(input: {
  item_id: string;
  order_date: string;
  quantity_ordered: number | null;
  notes: string | null;
}): Promise<PurchaseOrderRecord> {
  const { data, error } = await getSupabase()
    .from("inventory_purchase_orders")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Only writes a stock-ledger receipt the first time a PO's arrival_date is
// set (transition from null -> a date). Editing an already-received PO's
// arrival date afterward corrects the date without re-adding stock.
export async function markPurchaseOrderReceived(poId: string, arrivalDate: string): Promise<PurchaseOrderRecord> {
  const supabase = getSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_purchase_orders")
    .select("*")
    .eq("id", poId)
    .single();
  if (fetchErr) throw fetchErr;

  const wasAlreadyReceived = !!existing.arrival_date;

  const { data: updated, error: updateErr } = await supabase
    .from("inventory_purchase_orders")
    .update({ arrival_date: arrivalDate, updated_at: new Date().toISOString() })
    .eq("id", poId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  if (!wasAlreadyReceived && existing.quantity_ordered) {
    const { error: ledgerErr } = await supabase.from("inventory_stock_ledger").upsert(
      { item_id: existing.item_id, delta: existing.quantity_ordered, reason: `received:${poId}` },
      { onConflict: "item_id,reason", ignoreDuplicates: true }
    );
    if (ledgerErr) throw ledgerErr;
  }

  return updated;
}

// ── Monthly sales upload ──────────────────────────────────────────────────────

export type SalesUploadRow = { name: string; unitsSold: number; unitsRefunded: number };

export type SalesUploadResult =
  | { status: "error"; message: string }
  | {
      status: "conflict";
      monthKey: string;
      matched: { itemId: string; name: string; netUnits: number }[];
    }
  | {
      status: "applied";
      monthKey: string;
      applied: { name: string; netUnits: number }[];
      unmatched: { name: string; netUnits: number }[];
    };

// Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/quotes
// inside quotes ("" is a literal quote), and \r\n or \n line endings. Square's
// export quotes price fields with embedded commas (e.g. "$1,328.00"), so a
// naive text.split(",") would misalign every column after the first one.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function parseSquareSalesSummary(csvText: string): SalesUploadRow[] | null {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return null;
  const header = rows[0];
  const nameIdx = header.indexOf("Item Name");
  const soldIdx = header.indexOf("Units Sold");
  const refundedIdx = header.indexOf("Units Refunded");
  if (nameIdx === -1 || soldIdx === -1 || refundedIdx === -1) return null;

  const byName = new Map<string, SalesUploadRow>();
  for (const r of rows.slice(1)) {
    const name = (r[nameIdx] ?? "").trim();
    if (!name) continue;
    const unitsSold = Number(r[soldIdx] ?? 0) || 0;
    const unitsRefunded = Number(r[refundedIdx] ?? 0) || 0;
    const existing = byName.get(name);
    if (existing) {
      existing.unitsSold += unitsSold;
      existing.unitsRefunded += unitsRefunded;
    } else {
      byName.set(name, { name, unitsSold, unitsRefunded });
    }
  }
  return Array.from(byName.values());
}

export async function processSalesUpload(
  monthKey: string,
  csvText: string,
  replace: boolean
): Promise<SalesUploadResult> {
  const rows = parseSquareSalesSummary(csvText);
  if (!rows) {
    return { status: "error", message: "Couldn't find Item Name / Units Sold / Units Refunded columns in this file." };
  }

  const supabase = getSupabase();
  const { data: items, error: itemsErr } = await supabase.from("inventory_items").select("id, name");
  if (itemsErr) throw itemsErr;

  const itemByName = new Map((items as { id: string; name: string }[]).map((i) => [i.name.toLowerCase().trim(), i]));

  const matched: { itemId: string; name: string; netUnits: number }[] = [];
  const unmatched: { name: string; netUnits: number }[] = [];
  for (const row of rows) {
    // Net of refunds: Square's "Units Sold" and "Units Refunded" come from
    // separate transaction records (a refund references but doesn't rewrite
    // the original sale line), so consumption is sold minus refunded.
    const netUnits = row.unitsSold - row.unitsRefunded;
    const item = itemByName.get(row.name.toLowerCase().trim());
    if (item) {
      matched.push({ itemId: item.id, name: item.name, netUnits });
    } else {
      unmatched.push({ name: row.name, netUnits });
    }
  }

  const reason = `sales:${monthKey}`;
  const { data: existingLedgerRows, error: existingErr } = await supabase
    .from("inventory_stock_ledger")
    .select("id, item_id")
    .eq("reason", reason)
    .in("item_id", matched.map((m) => m.itemId));
  if (existingErr) throw existingErr;

  if ((existingLedgerRows?.length ?? 0) > 0 && !replace) {
    return { status: "conflict", monthKey, matched };
  }

  if (replace && existingLedgerRows && existingLedgerRows.length > 0) {
    const { error: deleteErr } = await supabase
      .from("inventory_stock_ledger")
      .delete()
      .in("id", existingLedgerRows.map((r) => r.id));
    if (deleteErr) throw deleteErr;
  }

  if (matched.length > 0) {
    const { error: insertErr } = await supabase.from("inventory_stock_ledger").insert(
      matched.map((m) => ({ item_id: m.itemId, delta: -m.netUnits, reason }))
    );
    if (insertErr) throw insertErr;
  }

  return {
    status: "applied",
    monthKey,
    applied: matched.map((m) => ({ name: m.name, netUnits: m.netUnits })),
    unmatched,
  };
}
