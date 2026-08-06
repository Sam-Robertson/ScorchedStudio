"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { previousMonthKey } from "@/lib/timezone";
import { Check, ClipboardCheck, Package, Plus, Truck, Upload, X } from "lucide-react";
import type { ItemWithStats, SalesUploadResult } from "@/lib/inventory";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

const STATUS_BADGE: Record<ItemWithStats["status"], string> = {
  reorder_now: "bg-red-100 text-red-700",
  ok: "bg-green-100 text-green-700",
  no_lead_time_data: "bg-neutral-100 text-neutral-500",
};

const STATUS_LABEL: Record<ItemWithStats["status"], string> = {
  reorder_now: "Reorder now",
  ok: "OK",
  no_lead_time_data: "No lead time data",
};

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export default function AdminInventoryPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <InventoryDashboard token={token} />;
}

function InventoryDashboard({ token }: { token: string }) {
  const [items, setItems] = useState<ItemWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", sku: "", safety_buffer_units: "7" });
  const [adding, setAdding] = useState(false);

  const [showUpload, setShowUpload] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/inventory", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ items: list, error: err }) => {
        if (err) throw new Error(err);
        setItems(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: newItem.name,
          sku: newItem.sku || null,
          safety_buffer_units: Number(newItem.safety_buffer_units) || 0,
        }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setNewItem({ name: "", sku: "", safety_buffer_units: "7" });
      setShowAdd(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <h1 className="h2 font-bold">Inventory</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowUpload((v) => !v); setShowAdd(false); }}
            className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-4 py-2.5 text-xs tracking-[0.15em] text-neutral-700 font-semibold hover:bg-neutral-50`}
          >
            <Upload className="w-3.5 h-3.5" />
            UPLOAD SALES
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setShowUpload(false); setError(null); }}
            className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
          >
            <Plus className="w-3.5 h-3.5" />
            ADD ITEM
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>
      )}

      {showUpload && (
        <UploadSalesPanel token={token} onDone={() => { setShowUpload(false); load(); }} onCancel={() => setShowUpload(false)} />
      )}

      {showAdd && (
        <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
          <p className={`${vulfMono.className} font-bold text-sm mb-4`}>New Item</p>
          <form onSubmit={addItem} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs text-neutral-500 mb-1">Name</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Coaster Set"
                  value={newItem.name}
                  onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">SKU (optional)</label>
                <input
                  className={inputCls}
                  value={newItem.sku}
                  onChange={(e) => setNewItem((s) => ({ ...s, sku: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Safety buffer (units)</label>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={newItem.safety_buffer_units}
                  onChange={(e) => setNewItem((s) => ({ ...s, safety_buffer_units: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={adding}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
              >
                <Check className="w-3.5 h-3.5" />
                {adding ? "SAVING…" : "SAVE"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
              >
                <X className="w-3.5 h-3.5" />
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading inventory…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-400 py-16 text-center">No items yet. Add one to get started.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} token={token} onChanged={load} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, token, onChanged }: { item: ItemWithStats; token: string; onChanged: () => void }) {
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState({
    name: item.name,
    sku: item.sku ?? "",
    safety_buffer_units: String(item.safety_buffer_units),
  });

  const [showCount, setShowCount] = useState(false);
  const [countValue, setCountValue] = useState("");

  const [showPo, setShowPo] = useState(false);
  const [poForm, setPoForm] = useState({ order_date: "", quantity_ordered: "", notes: "" });

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [arrivalDate, setArrivalDate] = useState("");

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          name: editState.name,
          sku: editState.sku || null,
          safety_buffer_units: Number(editState.safety_buffer_units) || 0,
        }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/${item.id}/count`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ countedQty: Number(countValue) }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setShowCount(false);
      setCountValue("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Count failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory/purchase-orders", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          item_id: item.id,
          order_date: poForm.order_date,
          quantity_ordered: poForm.quantity_ordered ? Number(poForm.quantity_ordered) : null,
          notes: poForm.notes || null,
        }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setShowPo(false);
      setPoForm({ order_date: "", quantity_ordered: "", notes: "" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logging order failed");
    } finally {
      setBusy(false);
    }
  }

  async function markReceived(poId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ arrival_date: arrivalDate }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setReceivingId(null);
      setArrivalDate("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark received");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className={inputCls} value={editState.name} onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))} />
            <input className={inputCls} placeholder="SKU" value={editState.sku} onChange={(e) => setEditState((s) => ({ ...s, sku: e.target.value }))} />
            <input className={inputCls} type="number" min="0" value={editState.safety_buffer_units} onChange={(e) => setEditState((s) => ({ ...s, safety_buffer_units: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={busy} className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}>
              <Check className="w-3.5 h-3.5" /> SAVE
            </button>
            <button onClick={() => setEditing(false)} className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-4 py-2 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}>
              <X className="w-3.5 h-3.5" /> CANCEL
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <p className={`${vulfMono.className} font-bold text-sm`}>{item.name}</p>
                {item.sku && <span className="text-xs text-neutral-400">{item.sku}</span>}
              </div>
              <span className={`inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            <button onClick={() => setEditing(true)} className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
              Edit
            </button>
          </div>

          <div className={`${vulfMono.className} mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs`}>
            <Stat label="On hand" value={String(item.on_hand_qty)} />
            <Stat label={`${item.prior_month_key} avg/day`} value={item.prior_month_units_sold === null ? "no data" : round1(item.prior_month_daily_avg)} />
            <Stat label="All-time avg/day" value={round1(item.all_time_daily_avg)} />
            <Stat label="Lead time" value={item.lead_time_days === null ? "—" : `${round1(item.lead_time_days)}d`} />
            <Stat label="Reorder point" value={item.reorder_point === null ? "—" : String(item.reorder_point)} />
          </div>

          {item.open_purchase_orders.length > 0 && (
            <div className="mt-4 space-y-2">
              {item.open_purchase_orders.map((po) => (
                <div key={po.id} className={`${vulfMono.className} flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs`}>
                  <span className="text-amber-800">
                    Ordered {po.order_date}{po.quantity_ordered ? ` — qty ${po.quantity_ordered}` : ""} — in transit
                  </span>
                  {receivingId === po.id ? (
                    <div className="flex items-center gap-2">
                      <input type="date" className="rounded border border-black/20 px-2 py-1 text-xs" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
                      <button onClick={() => markReceived(po.id)} disabled={busy || !arrivalDate} className="rounded bg-[#519A70] text-white px-2 py-1 disabled:opacity-60">Save</button>
                      <button onClick={() => setReceivingId(null)} className="text-neutral-400">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setReceivingId(po.id)} className="underline underline-offset-2 text-amber-800 hover:opacity-70">
                      Mark received
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => { setShowCount((v) => !v); setShowPo(false); }} className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-3 py-2 text-xs tracking-[0.1em] text-neutral-700 font-semibold hover:bg-neutral-50`}>
              <ClipboardCheck className="w-3.5 h-3.5" /> RECORD COUNT
            </button>
            <button onClick={() => { setShowPo((v) => !v); setShowCount(false); }} className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-3 py-2 text-xs tracking-[0.1em] text-neutral-700 font-semibold hover:bg-neutral-50`}>
              <Truck className="w-3.5 h-3.5" /> LOG PURCHASE ORDER
            </button>
          </div>

          {showCount && (
            <form onSubmit={submitCount} className="mt-3 flex items-end gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Counted quantity</label>
                <input className={inputCls} type="number" min="0" value={countValue} onChange={(e) => setCountValue(e.target.value)} required autoFocus />
              </div>
              <button type="submit" disabled={busy} className={`${vulfMono.className} rounded-xl bg-[#519A70] px-4 py-2 text-xs text-white font-semibold hover:opacity-90 disabled:opacity-60`}>
                Save
              </button>
            </form>
          )}

          {showPo && (
            <form onSubmit={submitPo} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Order date</label>
                <input className={inputCls} type="date" value={poForm.order_date} onChange={(e) => setPoForm((s) => ({ ...s, order_date: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Quantity ordered (optional)</label>
                <input className={inputCls} type="number" min="1" value={poForm.quantity_ordered} onChange={(e) => setPoForm((s) => ({ ...s, quantity_ordered: e.target.value }))} />
              </div>
              <button type="submit" disabled={busy} className={`${vulfMono.className} rounded-xl bg-[#519A70] px-4 py-2 text-xs text-white font-semibold hover:opacity-90 disabled:opacity-60`}>
                Save
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-400">{label}</p>
      <p className="text-sm font-bold text-neutral-800 mt-0.5">{value}</p>
    </div>
  );
}

// ── Upload sales panel ────────────────────────────────────────────────────────

function UploadSalesPanel({ token, onDone, onCancel }: { token: string; onDone: () => void; onCancel: () => void }) {
  const [monthKey, setMonthKey] = useState(previousMonthKey());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Exclude<SalesUploadResult, { status: "error" }> | null>(null);

  async function submit(replace: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/admin/inventory/sales-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey, csvText, replace }),
      });
      const data: SalesUploadResult | { error: string } = await res.json();
      if ("error" in data) throw new Error(data.error);
      if (data.status === "error") throw new Error(data.message);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
      <p className={`${vulfMono.className} font-bold text-sm mb-4`}>Upload Monthly Sales</p>
      <p className="text-xs text-neutral-500 mb-4">
        Use Square&apos;s Item Sales Summary report (not the detailed transaction report).
      </p>

      {!result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Month</label>
              <input className={inputCls} type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">CSV file</label>
              <input className={inputCls} type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => submit(false)}
              disabled={busy || !file}
              className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
            >
              <Upload className="w-3.5 h-3.5" />
              {busy ? "UPLOADING…" : "UPLOAD"}
            </button>
            <button onClick={onCancel} className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}>
              <X className="w-3.5 h-3.5" /> CANCEL
            </button>
          </div>
        </div>
      ) : result.status === "conflict" ? (
        <div className="space-y-4">
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
            {result.monthKey} has already been uploaded. Uploading again will replace those numbers with this file&apos;s.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => submit(true)}
              disabled={busy}
              className={`${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
            >
              {busy ? "REPLACING…" : "REPLACE"}
            </button>
            <button onClick={onCancel} className={`${vulfMono.className} rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}>
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
            Applied {result.applied.length} item{result.applied.length === 1 ? "" : "s"} for {result.monthKey}.
          </p>
          {result.unmatched.length > 0 && (
            <div className="text-xs text-neutral-600">
              <p className="font-semibold mb-1 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Not in your inventory catalog (skipped):</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {result.unmatched.map((u) => (
                  <li key={u.name}>{u.name} ({u.netUnits} sold)</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={onDone} className={`${vulfMono.className} rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}>
            DONE
          </button>
        </div>
      )}
    </div>
  );
}
