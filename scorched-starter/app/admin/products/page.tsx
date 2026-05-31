"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { Check, Pencil, Plus, X } from "lucide-react";
import type { ProductRecord } from "@/lib/supabase";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

export default function AdminProductsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <ProductsDashboard token={token} />;
}

type EditState = {
  name: string;
  width_in: string;
  height_in: string;
  notes: string;
};

function ProductsDashboard({ token }: { token: string }) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: "", width_in: "", height_in: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState<EditState>({ name: "", width_in: "", height_in: "", notes: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/products", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(({ products: list, error: err }) => {
        if (err) throw new Error(err);
        setProducts(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function startEdit(p: ProductRecord) {
    setEditingId(p.id);
    setEditState({
      name: p.name,
      width_in: String(p.width_in),
      height_in: String(p.height_in),
      notes: p.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editState),
      });
      const { product, error: err } = await res.json();
      if (err) throw new Error(err);
      setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: ProductRecord) {
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !p.active }),
      });
      const { product, error: err } = await res.json();
      if (err) throw new Error(err);
      setProducts((prev) => prev.map((q) => (q.id === p.id ? product : q)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newProduct),
      });
      const { product, error: err } = await res.json();
      if (err) throw new Error(err);
      setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProduct({ name: "", width_in: "", height_in: "", notes: "" });
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="h2 font-bold">Products</h1>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ADD PRODUCT</span>
          <span className="sm:hidden">ADD</span>
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>
      )}

      {/* Add product form */}
      {showAdd && (
        <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
          <p className={`${vulfMono.className} font-bold text-sm mb-4`}>New Product</p>
          <form onSubmit={addProduct} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs text-neutral-500 mb-1">Name</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Coaster"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Width (in)</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="0.0"
                  value={newProduct.width_in}
                  onChange={(e) => setNewProduct((s) => ({ ...s, width_in: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Height (in)</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="0.0"
                  value={newProduct.height_in}
                  onChange={(e) => setNewProduct((s) => ({ ...s, height_in: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Notes (optional)</label>
              <input
                className={inputCls}
                placeholder="Any notes for this product…"
                value={newProduct.notes}
                onChange={(e) => setNewProduct((s) => ({ ...s, notes: e.target.value }))}
              />
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
                onClick={() => { setShowAdd(false); setError(null); }}
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
          Loading products…
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const isEditing = editingId === product.id;
            return (
              <div
                key={product.id}
                className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition-colors ${
                  isEditing ? "border-[#884A20]/30" : "border-black/10"
                } ${!product.active ? "opacity-60" : ""}`}
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label className="block text-xs text-neutral-500 mb-1">Name</label>
                        <input
                          className={inputCls}
                          value={editState.name}
                          onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Width (in)</label>
                        <input
                          className={inputCls}
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={editState.width_in}
                          onChange={(e) => setEditState((s) => ({ ...s, width_in: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Height (in)</label>
                        <input
                          className={inputCls}
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={editState.height_in}
                          onChange={(e) => setEditState((s) => ({ ...s, height_in: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                      <input
                        className={inputCls}
                        value={editState.notes}
                        onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
                        placeholder="Optional notes…"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveEdit(product.id)}
                        disabled={saving}
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {saving ? "SAVING…" : "SAVE"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
                      >
                        <X className="w-3.5 h-3.5" />
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`${vulfMono.className} font-bold text-sm`}>{product.name}</p>
                        <span
                          className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full font-semibold ${
                            product.active
                              ? "bg-[#519A70]/15 text-[#519A70]"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {product.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                        {product.width_in}&Prime;W × {product.height_in}&Prime;H
                      </p>
                      {product.notes && (
                        <p className="text-xs text-neutral-400 mt-1">{product.notes}</p>
                      )}
                    </div>
                    {/* Action buttons — always in a row, right-aligned */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(product)}
                        className={`${vulfMono.className} rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap`}
                      >
                        {product.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => startEdit(product)}
                        className={`${vulfMono.className} flex items-center gap-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
