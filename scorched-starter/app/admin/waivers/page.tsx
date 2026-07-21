"use client";

// app/admin/waivers/page.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import type { WaiverRecord, WaiverMinor } from "@/lib/supabase";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                       */
/* ------------------------------------------------------------------ */

type SortField = "first_name" | "email" | "signed_at" | "date_of_birth";
type SortDir = "asc" | "desc";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

/* ------------------------------------------------------------------ */
/* Main page                                                            */
/* ------------------------------------------------------------------ */

export default function AdminWaiversPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;

  return <WaiversDashboard token={token} />;
}

/* ------------------------------------------------------------------ */
/* Dashboard (authenticated)                                            */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 30;

function WaiversDashboard({ token }: { token: string }) {
  const [waivers, setWaivers] = useState<WaiverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("signed_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<WaiverRecord | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/admin/waivers", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => { setWaivers(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [token]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSortField(field); setSortDir("asc"); }
    },
    [sortField]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return waivers
      .filter((w) => {
        const nameMatch = `${w.first_name} ${w.last_name}`.toLowerCase().includes(q);
        const emailMatch = w.email.toLowerCase().includes(q);
        if (q && !nameMatch && !emailMatch) return false;
        if (dateFrom && new Date(w.signed_at) < new Date(dateFrom)) return false;
        if (dateTo && new Date(w.signed_at) > new Date(dateTo + "T23:59:59")) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[sortField] ?? "";
        const bv = b[sortField] ?? "";
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
  }, [waivers, search, dateFrom, dateTo, sortField, sortDir]);

  // Reset to page 1 whenever filters or sort change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:opacity-70"
    >
      {label}
      <span className="text-[10px] opacity-50">
        {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  return (
    <section className="container-px py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Waivers</h1>
          {!loading && !error && (
            <p className={`${vulfMono.className} text-sm text-neutral-500 mt-1`}>
              {filtered.length} of {waivers.length} total
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
            ← Admin
          </a>
          <button
            onClick={() => { clearAdminToken(); window.location.href = "/admin"; }}
            className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          placeholder="Search by name or email…"
          className={`${inputCls} flex-1`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 items-center">
          <label className="text-xs text-neutral-500 whitespace-nowrap">From</label>
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-neutral-500 whitespace-nowrap">To</label>
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            className="text-xs text-neutral-400 underline underline-offset-2 whitespace-nowrap hover:text-neutral-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* States */}
      {loading && (
        <p className={`${vulfMono.className} text-sm text-neutral-500 py-10 text-center`}>
          Loading…
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 py-10 text-center">Error: {error}</p>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-black/5">
            {filtered.length === 0 && (
              <p className={`${vulfMono.className} px-4 py-10 text-center text-neutral-400 text-sm`}>No waivers found.</p>
            )}
            {paginated.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50 active:bg-neutral-100"
                onClick={() => setSelected(w)}
              >
                <div className="min-w-0">
                  <p className={`${vulfMono.className} text-sm font-medium truncate`}>{w.first_name} {w.last_name}</p>
                  <p className={`${vulfMono.className} text-xs text-neutral-500 truncate mt-0.5`}>{w.email}</p>
                </div>
                <p className={`${vulfMono.className} text-xs text-neutral-400 shrink-0`}>{fmt(w.signed_at)}</p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <table className={`${vulfMono.className} hidden sm:table w-full text-sm`}>
            <thead>
              <tr className="border-b border-black/10 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3"><SortBtn field="first_name" label="Name" /></th>
                <th className="px-4 py-3"><SortBtn field="email" label="Email" /></th>
                <th className="px-4 py-3 hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 hidden lg:table-cell"><SortBtn field="date_of_birth" label="DOB" /></th>
                <th className="px-4 py-3"><SortBtn field="signed_at" label="Signed" /></th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                    No waivers found.
                  </td>
                </tr>
              )}
              {paginated.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-black/5 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                  onClick={() => setSelected(w)}
                >
                  <td className="px-4 py-3 font-medium">{w.first_name} {w.last_name}</td>
                  <td className="px-4 py-3 text-neutral-600">{w.email}</td>
                  <td className="px-4 py-3 text-neutral-600 hidden md:table-cell">{w.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-600 hidden lg:table-cell">
                    {w.date_of_birth ? fmt(w.date_of_birth + "T00:00:00") : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{fmt(w.signed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-brand underline underline-offset-2">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className={`${vulfMono.className} flex items-center justify-between mt-4 text-sm`}>
          <p className="text-xs text-neutral-400">
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-black/20 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-default"
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-xs text-neutral-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                      page === p
                        ? "bg-[#884A20] text-white"
                        : "border border-black/20 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-black/20 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-default"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <WaiverModal
          waiver={selected}
          token={token}
          onClose={() => setSelected(null)}
          onDelete={(id) => {
            setWaivers((prev) => prev.filter((w) => w.id !== id));
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Detail modal                                                          */
/* ------------------------------------------------------------------ */

function WaiverModal({
  waiver: w,
  token,
  onClose,
  onDelete,
}: {
  waiver: WaiverRecord;
  token: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [loadingSignature, setLoadingSignature] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/admin/waivers/${w.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setSignatureData(d.signature_data ?? null); setLoadingSignature(false); })
      .catch(() => setLoadingSignature(false));
  }, [w.id, token]);

  async function handleDelete() {
    if (!confirm(`Delete waiver for ${w.first_name} ${w.last_name}? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/waivers/${w.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setDeleteError("Failed to delete. Please try again.");
      setDeleting(false);
      return;
    }
    onDelete(w.id);
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-base`}>
            {w.first_name} {w.last_name}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={`${vulfMono.className} px-6 py-5 space-y-4 text-sm`}>
          <Row label="Email" value={w.email} />
          <Row label="Phone" value={w.phone ?? "—"} />
          <Row label="Date of Birth" value={w.date_of_birth ? fmt(w.date_of_birth + "T00:00:00") : "—"} />
          <Row label="Signed At" value={fmtFull(w.signed_at)} />
          <Row label="IP Address" value={w.ip_address ?? "—"} />

          {/* Minors */}
          {w.minors && w.minors.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
                Minor Participants ({w.minors.length})
              </p>
              <div className="space-y-2">
                {w.minors.map((m: WaiverMinor, i: number) => (
                  <div key={i} className="rounded-lg bg-neutral-50 border border-black/8 px-3 py-2">
                    <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      b. {fmt(m.dateOfBirth + "T00:00:00")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature */}
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Signature</p>
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-3 flex items-center justify-center min-h-[80px]">
              {loadingSignature ? (
                <span className="text-xs text-neutral-400">Loading…</span>
              ) : signatureData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureData}
                  alt={`Signature of ${w.first_name} ${w.last_name}`}
                  className="max-w-full max-h-40 object-contain"
                />
              ) : (
                <span className="text-xs text-neutral-400">Unavailable</span>
              )}
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-black/5">
            {deleteError && <p className="text-xs text-red-600 mb-2">{deleteError}</p>}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`${vulfMono.className} text-xs text-red-500 underline underline-offset-2 hover:text-red-700 disabled:opacity-50`}
            >
              {deleting ? "Deleting…" : "Delete this waiver"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-28 shrink-0">{label}</span>
      <span className="text-neutral-800 break-all">{value}</span>
    </div>
  );
}
