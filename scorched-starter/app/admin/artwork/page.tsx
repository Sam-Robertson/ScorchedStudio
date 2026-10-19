"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Check, ImageIcon, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { ArtworkRecord } from "@/lib/supabase";
import { ARTWORK_STATUSES, ARTWORK_STATUS_LABELS, leaseDaysLeft, type ArtworkStatus } from "@/lib/artwork";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";
const LOCATION_LABELS = { orem: "Orem", slc: "Salt Lake City" } as const;

export default function AdminArtworkPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <ArtworkDashboard token={token} />;
}

// Everything the form edits, as strings so inputs can be blank.
type FormState = {
  title: string;
  artist_name: string;
  artist_email: string;
  artist_phone: string;
  medium: string;
  dimensions: string;
  location: "orem" | "slc";
  lease_start: string;
  lease_end: string;
  sale_price: string; // dollars
  commission_percent: string;
  status: ArtworkStatus;
  agreement_notes: string;
};

const EMPTY_FORM: FormState = {
  title: "", artist_name: "", artist_email: "", artist_phone: "", medium: "", dimensions: "",
  location: "orem", lease_start: "", lease_end: "", sale_price: "", commission_percent: "",
  status: "on_display", agreement_notes: "",
};

function toForm(a: ArtworkRecord): FormState {
  return {
    title: a.title,
    artist_name: a.artist_name,
    artist_email: a.artist_email ?? "",
    artist_phone: a.artist_phone ?? "",
    medium: a.medium ?? "",
    dimensions: a.dimensions ?? "",
    location: a.location,
    lease_start: a.lease_start,
    lease_end: a.lease_end ?? "",
    sale_price: a.sale_price_cents === null ? "" : (a.sale_price_cents / 100).toFixed(2),
    commission_percent: a.commission_percent === null ? "" : String(a.commission_percent),
    status: a.status,
    agreement_notes: a.agreement_notes ?? "",
  };
}

function toBody(f: FormState) {
  return {
    ...f,
    sale_price: undefined,
    sale_price_cents: f.sale_price.trim() === "" ? null : Math.round(Number(f.sale_price) * 100),
  };
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function prettyDate(ymd: string): string {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_STYLES: Record<ArtworkStatus, string> = {
  on_display: "bg-[#519A70]/15 text-[#519A70]",
  returned: "bg-neutral-100 text-neutral-500",
  sold: "bg-[#884A20]/15 text-[#884A20]",
};

function ArtworkDashboard({ token }: { token: string }) {
  const [items, setItems] = useState<ArtworkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ArtworkStatus | "all">("on_display");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/artwork", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ artwork, error: err }) => {
        if (err) throw new Error(err);
        setItems(artwork ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function replace(updated: ArtworkRecord) {
    setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function create(form: FormState) {
    const res = await fetch("/api/admin/artwork", { method: "POST", headers: authHeaders, body: JSON.stringify(toBody(form)) });
    const { artwork, error: err } = await res.json();
    if (err) throw new Error(err);
    setItems((prev) => [artwork, ...prev]);
    setShowAdd(false);
    // A new piece lands in the list it belongs to, not behind the filter.
    if (filter !== "all" && filter !== artwork.status) setFilter(artwork.status);
  }

  async function update(id: string, form: FormState) {
    const res = await fetch(`/api/admin/artwork/${id}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(toBody(form)) });
    const { artwork, error: err } = await res.json();
    if (err) throw new Error(err);
    replace(artwork);
    setEditingId(null);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/artwork/${id}`, { method: "DELETE", headers: authHeaders });
    const { error: err } = await res.json();
    if (err) throw new Error(err);
    setItems((prev) => prev.filter((a) => a.id !== id));
  }

  const visible = filter === "all" ? items : items.filter((a) => a.status === filter);
  const counts = ARTWORK_STATUSES.reduce(
    (m, s) => ({ ...m, [s]: items.filter((a) => a.status === s).length }),
    {} as Record<ArtworkStatus, number>
  );

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="h2 font-bold">Artwork</h1>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
            Pieces on loan from local artists: who lent them, how long we have them, and what they sell for.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setError(null); }}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 flex-shrink-0`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ADD ARTWORK</span>
          <span className="sm:hidden">ADD</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-6 mb-6">
        {([...ARTWORK_STATUSES, "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`${vulfMono.className} rounded-full px-3 py-1.5 text-xs border ${
              filter === s ? "bg-black text-white border-black" : "bg-white text-neutral-600 border-black/15 hover:bg-neutral-50"
            }`}
          >
            {s === "all" ? `All (${items.length})` : `${ARTWORK_STATUS_LABELS[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}

      {showAdd && (
        <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
          <p className={`${vulfMono.className} font-bold text-sm mb-4`}>New Artwork</p>
          <ArtworkForm
            initial={{ ...EMPTY_FORM, lease_start: todayYmd() }}
            onSubmit={create}
            onCancel={() => setShowAdd(false)}
            onError={setError}
          />
          <p className="text-xs text-neutral-400 mt-3">Save first, then add the photo from the card.</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading artwork…
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-400 py-10 text-center">
          {items.length === 0 ? "No artwork recorded yet." : "Nothing with this status."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((a) =>
            editingId === a.id ? (
              <div key={a.id} className="rounded-2xl border border-[#884A20]/30 bg-white p-5 sm:p-6 shadow-sm">
                <p className={`${vulfMono.className} font-bold text-sm mb-4`}>Edit: {a.title}</p>
                <ArtworkForm
                  initial={toForm(a)}
                  onSubmit={(f) => update(a.id, f)}
                  onCancel={() => setEditingId(null)}
                  onError={setError}
                />
              </div>
            ) : (
              <ArtworkCard
                key={a.id}
                artwork={a}
                token={token}
                onEdit={() => { setEditingId(a.id); setShowAdd(false); setError(null); }}
                onChange={replace}
                onDelete={() => remove(a.id).catch((e) => setError(e instanceof Error ? e.message : "Delete failed"))}
                onError={setError}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}

// ── Form (shared by add and edit) ────────────────────────────────────────────

function ArtworkForm({
  initial,
  onSubmit,
  onCancel,
  onError,
}: {
  initial: FormState;
  onSubmit: (f: FormState) => Promise<void>;
  onCancel: () => void;
  onError: (msg: string | null) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    try {
      await onSubmit(f);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const label = "block text-xs text-neutral-500 mb-1";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Title</label>
          <input className={inputCls} value={f.title} onChange={set("title")} required placeholder="e.g. Timpanogos at Dusk" />
        </div>
        <div>
          <label className={label}>Artist</label>
          <input className={inputCls} value={f.artist_name} onChange={set("artist_name")} required placeholder="Who lent it" />
        </div>
        <div>
          <label className={label}>Artist email</label>
          <input className={inputCls} type="email" value={f.artist_email} onChange={set("artist_email")} />
        </div>
        <div>
          <label className={label}>Artist phone</label>
          <input className={inputCls} type="tel" value={f.artist_phone} onChange={set("artist_phone")} />
        </div>
        <div>
          <label className={label}>Medium</label>
          <input className={inputCls} value={f.medium} onChange={set("medium")} placeholder="e.g. Oil on canvas" />
        </div>
        <div>
          <label className={label}>Dimensions</label>
          <input className={inputCls} value={f.dimensions} onChange={set("dimensions")} placeholder='e.g. 24" x 36"' />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={label}>Location</label>
          <select className={inputCls} value={f.location} onChange={set("location")}>
            <option value="orem">Orem</option>
            <option value="slc">Salt Lake City</option>
          </select>
        </div>
        <div>
          <label className={label}>Status</label>
          <select className={inputCls} value={f.status} onChange={set("status")}>
            {ARTWORK_STATUSES.map((s) => <option key={s} value={s}>{ARTWORK_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>On loan from</label>
          <input className={inputCls} type="date" value={f.lease_start} onChange={set("lease_start")} required />
        </div>
        <div>
          <label className={label}>Until (blank if open-ended)</label>
          <input className={inputCls} type="date" value={f.lease_end} onChange={set("lease_end")} min={f.lease_start || undefined} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Sale price $ (blank if not for sale)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={f.sale_price} onChange={set("sale_price")} placeholder="0.00" />
        </div>
        <div>
          <label className={label}>Studio commission %</label>
          <input className={inputCls} type="number" min="0" max="100" step="0.5" value={f.commission_percent} onChange={set("commission_percent")} placeholder="e.g. 30" />
        </div>
      </div>

      <div>
        <label className={label}>Agreement notes</label>
        <textarea
          className={`${inputCls} min-h-[90px]`}
          value={f.agreement_notes}
          onChange={set("agreement_notes")}
          placeholder="Insurance, who hangs and returns it, how a sale is paid out, anything else agreed."
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? "SAVING…" : "SAVE"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
        >
          <X className="w-3.5 h-3.5" />
          CANCEL
        </button>
      </div>
    </form>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ArtworkCard({
  artwork: a,
  token,
  onEdit,
  onChange,
  onDelete,
  onError,
}: {
  artwork: ArtworkRecord;
  token: string;
  onEdit: () => void;
  onChange: (a: ArtworkRecord) => void;
  onDelete: () => void;
  onError: (msg: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomed(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const daysLeft = a.status === "on_display" ? leaseDaysLeft(a.lease_end, todayYmd()) : null;
  const leaseLine = a.lease_end
    ? `${prettyDate(a.lease_start)} to ${prettyDate(a.lease_end)}`
    : `Since ${prettyDate(a.lease_start)}, open-ended`;
  const leaseHint =
    daysLeft === null ? null
    : daysLeft < 0 ? `${-daysLeft} day${daysLeft === -1 ? "" : "s"} past the end of the lease`
    : daysLeft === 0 ? "Lease ends today"
    : daysLeft <= 30 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
    : null;

  async function upload(file: File) {
    setUploading(true);
    onError(null);
    try {
      const signRes = await fetch(`/api/admin/artwork/${a.id}/image/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) throw new Error(signed.error ?? `Upload failed (${signRes.status})`);

      const fd = new FormData();
      fd.append("cacheControl", "3600");
      fd.append("", file);
      const putRes = await fetch(signed.signedUrl, { method: "PUT", headers: { "x-upsert": "true" }, body: fd });
      if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

      const finalRes = await fetch(`/api/admin/artwork/${a.id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: signed.path }),
      });
      const { artwork, error: err } = await finalRes.json();
      if (err) throw new Error(err);
      onChange(artwork);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage() {
    onError(null);
    const res = await fetch(`/api/admin/artwork/${a.id}/image`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const { artwork, error: err } = await res.json();
    if (err) { onError(err); return; }
    onChange(artwork);
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Photo */}
        <div className="flex-shrink-0 w-full sm:w-36">
          {a.image_url ? (
            <button type="button" onClick={() => setZoomed(true)} className="block w-full" aria-label={`View ${a.title} full size`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image_url} alt={a.title} className="w-full h-36 object-cover rounded-xl border border-black/10" />
            </button>
          ) : (
            <div className="w-full h-36 rounded-xl border border-dashed border-black/20 bg-neutral-50 flex items-center justify-center text-neutral-300">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={`${vulfMono.className} flex-1 flex items-center justify-center gap-1 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60`}
            >
              <Upload className="w-3 h-3" />
              {uploading ? "Uploading…" : a.image_url ? "Replace" : "Add photo"}
            </button>
            {a.image_url && (
              <button type="button" onClick={removeImage} aria-label="Remove photo" className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`${vulfMono.className} font-bold text-sm`}>{a.title}</p>
            <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[a.status]}`}>
              {ARTWORK_STATUS_LABELS[a.status]}
            </span>
            <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500`}>
              {LOCATION_LABELS[a.location]}
            </span>
          </div>
          <p className={`${vulfMono.className} text-xs text-neutral-600 mt-1`}>
            {a.artist_name}
            {a.artist_email && <> · <a href={`mailto:${a.artist_email}`} className="underline">{a.artist_email}</a></>}
            {a.artist_phone && <> · <a href={`tel:${a.artist_phone}`} className="underline">{a.artist_phone}</a></>}
          </p>
          {(a.medium || a.dimensions) && (
            <p className="text-xs text-neutral-500 mt-1">{[a.medium, a.dimensions].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-xs text-neutral-500 mt-2">
            {leaseLine}
            {leaseHint && <span className={`ml-2 font-semibold ${daysLeft !== null && daysLeft < 0 ? "text-red-600" : "text-amber-700"}`}>{leaseHint}</span>}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {a.sale_price_cents === null ? "Not for sale" : `For sale: ${money(a.sale_price_cents)}`}
            {a.sale_price_cents !== null && a.commission_percent !== null && (
              <> · studio keeps {a.commission_percent}% ({money(Math.round(a.sale_price_cents * a.commission_percent / 100))})</>
            )}
          </p>
          {a.agreement_notes && (
            <p className="text-xs text-neutral-400 mt-2 whitespace-pre-line">{a.agreement_notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0">
          <button
            onClick={onEdit}
            className={`${vulfMono.className} flex items-center gap-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={onDelete}
                className={`${vulfMono.className} rounded-lg bg-red-600 px-3 py-2 text-xs text-white hover:opacity-90`}
              >
                Confirm delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className={`${vulfMono.className} rounded-lg border border-black/15 px-3 py-2 text-xs text-neutral-600`}>
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${a.title}`}
              className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {zoomed && a.image_url && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setZoomed(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.image_url} alt={a.title} className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
