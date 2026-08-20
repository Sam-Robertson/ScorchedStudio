"use client";

// app/admin/bookings/page.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { useAdminSession } from "@/lib/adminSession";
import type { BookingRecord } from "@/lib/supabase";
import { MAX_PARTY_SIZE } from "@/lib/booking-utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminBookingsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;

  return <BookingsDashboard token={token} />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type Filter = "upcoming" | "all";
type ViewMode = "list" | "calendar";

function BookingsDashboard({ token }: { token: string }) {
  const { role } = useAdminSession();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [locationFilter, setLocationFilter] = useState<"" | "orem" | "slc">("");
  const [view, setView] = useState<ViewMode>("calendar");
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calDate, setCalDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookingRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/bookings", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => {
        setBookings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if (filter === "upcoming" && b.date < today) return false;
      if (locationFilter && b.location !== locationFilter) return false;
      if (q) {
        const match =
          b.name.toLowerCase().includes(q) ||
          b.email.toLowerCase().includes(q) ||
          b.date.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bookings, search, filter, today, locationFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, BookingRecord[]> = {};
    for (const b of filtered) {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    }
    return map;
  }, [filtered]);

  const sortedDates = Object.keys(grouped).sort((a, b) =>
    filter === "upcoming" ? a.localeCompare(b) : b.localeCompare(a)
  );

  const getOutPassCount = filtered.filter((b) => b.payment_method === "get_out_pass").length;

  return (
    <section className="container-px py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Bookings</h1>
          {!loading && !error && (
            <p className={`${vulfMono.className} text-sm text-neutral-500 mt-1`}>
              {filtered.length} booking{filtered.length !== 1 ? "s" : ""} shown
              {getOutPassCount > 0 && (
                <span className="ml-2 inline-block rounded-full bg-purple-100 text-purple-700 text-xs px-2 py-0.5">
                  {getOutPassCount} Get Out Pass
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/admin"
            className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
          >
            ← Admin
          </a>
          <button
            onClick={() => {
              clearAdminToken();
              window.location.href = "/admin";
            }}
            className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {view === "list" && (
          <input
            type="search"
            placeholder="Search by name, email, or date…"
            className={`${inputCls} flex-1`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="flex gap-2 flex-wrap">
          {(["upcoming", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`${vulfMono.className} rounded-lg px-4 py-2 text-xs capitalize transition-colors ${
                filter === f
                  ? "bg-[#884A20] text-white"
                  : "border border-black/20 text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {f}
            </button>
          ))}
          {role === "admin" && (
            <select
              className={`${vulfMono.className} rounded-lg border border-black/20 px-3 py-2 text-xs bg-white`}
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as "" | "orem" | "slc")}
            >
              <option value="">All locations</option>
              <option value="orem">Orem</option>
              <option value="slc">Salt Lake City</option>
            </select>
          )}
          <div className="flex rounded-lg border border-black/20 overflow-hidden">
            {(["list", "calendar"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`${vulfMono.className} px-4 py-2 text-xs capitalize transition-colors ${
                  view === v
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {search && view === "list" && (
          <button
            onClick={() => setSearch("")}
            className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
          >
            Clear
          </button>
        )}
      </div>

      {loading && (
        <p className={`${vulfMono.className} text-sm text-neutral-500 py-10 text-center`}>
          Loading…
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 py-10 text-center">Error: {error}</p>
      )}

      {/* Calendar view */}
      {!loading && !error && view === "calendar" && (
        <AdminCalendar
          bookings={filtered}
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          calDate={calDate}
          setCalDate={setCalDate}
          onSelect={setSelected}
        />
      )}

      {/* List view */}
      {!loading && !error && view === "list" && sortedDates.length === 0 && (
        <p className={`${vulfMono.className} text-sm text-neutral-400 py-10 text-center`}>
          No bookings found.
        </p>
      )}

      {!loading && !error && view === "list" && sortedDates.length > 0 && (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-400 mb-2`}>
                {fmtDate(date)}
              </p>
              <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-black/5">
                  {grouped[date].map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50 active:bg-neutral-100"
                      onClick={() => setSelected(b)}
                    >
                      <div className="min-w-0">
                        <p className={`${vulfMono.className} text-sm font-medium truncate`}>{b.time_slot} · {b.name}</p>
                        <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                          {b.party_size} {b.party_size === 1 ? "person" : "people"}
                          {b.payment_method && b.payment_method !== "stripe" && (
                            <span className="ml-2"><PaymentBadge method={b.payment_method} /></span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <table className={`${vulfMono.className} hidden sm:table w-full text-sm`}>
                  <thead>
                    <tr className="border-b border-black/10 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 hidden md:table-cell">Phone</th>
                      <th className="px-4 py-3">Party</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[date].map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-black/5 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                        onClick={() => setSelected(b)}
                      >
                        <td className="px-4 py-3 font-medium">{b.time_slot}</td>
                        <td className="px-4 py-3">{b.name}</td>
                        <td className="px-4 py-3 text-neutral-500">{b.email}</td>
                        <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{b.phone ?? "—"}</td>
                        <td className="px-4 py-3">{b.party_size}</td>
                        <td className="px-4 py-3"><PaymentBadge method={b.payment_method} /></td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-brand underline underline-offset-2">View</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New booking button */}
      {!loading && !error && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className={`${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
          >
            + NEW BOOKING
          </button>
        </div>
      )}

      {creating && (
        <NewBookingModal
          token={token}
          onClose={() => setCreating(false)}
          onCreate={(booking) => {
            setBookings((prev) => [...prev, booking]);
            setCreating(false);
          }}
        />
      )}

      {selected && (
        <BookingModal
          booking={selected}
          token={token}
          onClose={() => setSelected(null)}
          onCancel={(id) => {
            setBookings((prev) =>
              prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
            );
            setSelected(null);
          }}
          onUpdate={(id, updates) => {
            setBookings((prev) =>
              prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
            );
            setSelected((prev) => prev ? { ...prev, ...updates } : null);
          }}
        />
      )}
    </section>
  );
}

// ── Detail / Edit modal ────────────────────────────────────────────────────────

function BookingModal({
  booking: b,
  token,
  onClose,
  onCancel,
  onUpdate,
}: {
  booking: BookingRecord;
  token: string;
  onClose: () => void;
  onCancel: (id: string) => void;
  onUpdate: (id: string, updates: { date: string; time_slot: string; party_size: number }) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(b.date);
  const [editSlot, setEditSlot] = useState(b.time_slot);
  const [editParty, setEditParty] = useState(b.party_size);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>([]);

  // Fetch valid slots for the selected date, resetting the selection if it's no longer valid
  useEffect(() => {
    fetch(`/api/bookings/availability?date=${editDate}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => {
        const list = (data.slots ?? []).map((s: { time: string }) => s.time);
        setSlots(list);
        setEditSlot((prev) => (!list.includes(prev) && list.length > 0 ? list[0] : prev));
      });
  }, [editDate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCancel() {
    if (!confirm(`Cancel booking for ${b.name} on ${fmtDateShort(b.date)} at ${b.time_slot}? This cannot be undone.`))
      return;
    setCancelling(true);
    setCancelError(null);
    const res = await fetch(`/api/admin/bookings/${b.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) {
      setCancelError("Failed to cancel. Please try again.");
      setCancelling(false);
      return;
    }
    onCancel(b.id);
  }

  async function handleSaveEdit() {
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/admin/bookings/${b.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "update",
        date: editDate,
        time_slot: editSlot,
        party_size: editParty,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setEditError(json.error ?? "Failed to update. Please try again.");
      setEditSaving(false);
      return;
    }
    onUpdate(b.id, { date: editDate, time_slot: editSlot, party_size: editParty });
    setEditing(false);
    setEditSaving(false);
  }

  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-base`}>{b.name}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={`${vulfMono.className} px-6 py-5 space-y-3 text-sm`}>
          {/* Details */}
          <DetailRow label="Date" value={fmtDate(b.date)} />
          <DetailRow label="Time" value={b.time_slot} />
          <DetailRow label="Party" value={`${b.party_size} ${b.party_size === 1 ? "person" : "people"}`} />
          <DetailRow label="Email" value={b.email} />
          <DetailRow label="Phone" value={b.phone ?? "—"} />
          <DetailRow label="Paid" value={`$${(b.amount_paid / 100).toFixed(2)}`} />
          <div className="flex gap-3">
            <span className="text-neutral-400 w-16 shrink-0">Payment</span>
            <PaymentBadge method={b.payment_method} />
          </div>
          <DetailRow label="Status" value={b.status} />
          <DetailRow label="Booked" value={fmtDateTime(b.created_at)} />
          {b.referral_source && (
            <DetailRow
              label="Heard"
              value={b.referral_source === "Other" && b.referral_other ? `Other: ${b.referral_other}` : (b.referral_source ?? "")}
            />
          )}

          {/* Edit form */}
          {editing && (
            <div className="pt-4 border-t border-black/10 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Edit booking</p>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Date</label>
                <input
                  type="date"
                  min={today}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={`${inputCls} w-full`}
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Time slot</label>
                {slots.length === 0 ? (
                  <p className="text-xs text-red-500">No slots available on this date.</p>
                ) : (
                  <select
                    value={editSlot}
                    onChange={(e) => setEditSlot(e.target.value)}
                    className={`${inputCls} w-full`}
                  >
                    {slots.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Party size</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_PARTY_SIZE}
                  value={editParty}
                  onChange={(e) => setEditParty(Number(e.target.value))}
                  className={`${inputCls} w-32`}
                />
              </div>

              {editError && <p className="text-xs text-red-600">{editError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || slots.length === 0}
                  className="rounded-lg bg-[#884A20] text-white text-xs px-4 py-2 hover:opacity-90 disabled:opacity-50"
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditDate(b.date);
                    setEditSlot(b.time_slot);
                    setEditParty(b.party_size);
                    setEditError(null);
                  }}
                  className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {b.status === "confirmed" && !editing && (
            <div className="pt-3 border-t border-black/5 flex gap-4 flex-wrap">
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-[#884A20] underline underline-offset-2 hover:opacity-70"
              >
                Edit booking
              </button>
              {cancelError && (
                <p className="text-xs text-red-600 w-full">{cancelError}</p>
              )}
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-xs text-red-500 underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel booking"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New booking modal ─────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "stripe", label: "Stripe (paid online)" },
  { value: "gift_card", label: "Gift card (pay in-studio)" },
  { value: "get_out_pass", label: "Get Out Pass" },
  { value: "complimentary", label: "Complimentary" },
] as const;

function NewBookingModal({
  token,
  onClose,
  onCreate,
}: {
  token: string;
  onClose: () => void;
  onCreate: (booking: BookingRecord) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "gift_card" | "get_out_pass" | "complimentary">("complimentary");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/bookings/availability?date=${date}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => {
        const list = (data.slots ?? []).map((s: { time: string }) => s.time);
        setSlots(list);
        setSlot(list.length > 0 ? list[0] : "");
      });
  }, [date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) { setError("No time slots available on this date."); return; }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        date,
        time_slot: slot,
        party_size: partySize,
        payment_method: paymentMethod,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to create booking.");
      setSaving(false);
      return;
    }

    onCreate(json);
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-base`}>New Booking</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`${vulfMono.className} px-6 py-5 space-y-4 text-sm`}>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputCls} w-full`}
              placeholder="Full name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Email <span className="font-normal text-neutral-300">(optional)</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Date *</label>
              <input
                required
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Party size *</label>
              <input
                required
                type="number"
                min={1}
                max={MAX_PARTY_SIZE}
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
                className={`${inputCls} w-full`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">Time slot *</label>
            {slots.length === 0 ? (
              <p className="text-xs text-red-500">No slots available on this date.</p>
            ) : (
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className={`${inputCls} w-full`}
              >
                {slots.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">Payment method *</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className={`${inputCls} w-full`}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || slots.length === 0}
              className="rounded-xl bg-[#884A20] text-white text-xs px-5 py-2.5 tracking-[0.15em] font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Creating…" : "CREATE BOOKING"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Admin Calendar ────────────────────────────────────────────────────────────

function AdminCalendar({
  bookings,
  calMonth,
  setCalMonth,
  calDate,
  setCalDate,
  onSelect,
}: {
  bookings: BookingRecord[];
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  calDate: string | null;
  setCalDate: (d: string | null) => void;
  onSelect: (b: BookingRecord) => void;
}) {
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const monthLabel = calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

  // Build a map of date → bookings for this month
  const byDate = useMemo(() => {
    const map: Record<string, BookingRecord[]> = {};
    for (const b of bookings) {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    }
    return map;
  }, [bookings]);

  const cells: Array<string | null> = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];

  const dayBookings = calDate ? (byDate[calDate] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => { setCalMonth(new Date(year, month - 1, 1)); setCalDate(null); }}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-neutral-100 text-xl"
          >‹</button>
          <span className={`${vulfMono.className} text-base font-medium`}>{monthLabel}</span>
          <button
            onClick={() => { setCalMonth(new Date(year, month + 1, 1)); setCalDate(null); }}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-neutral-100 text-xl"
          >›</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className={`${vulfMono.className} text-center text-xs text-neutral-400 py-1`}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`e-${i}`} />;
            const dayBs = byDate[dateStr] ?? [];
            const hasBookings = dayBs.length > 0;
            const isToday = dateStr === today;
            const isSelected = dateStr === calDate;
            const totalPeople = dayBs.reduce((s, b) => s + b.party_size, 0);
            return (
              <button
                key={dateStr}
                onClick={() => setCalDate(isSelected ? null : dateStr)}
                className={[
                  "rounded-xl flex flex-col items-center justify-center py-2 px-1 transition-colors min-h-[52px]",
                  isSelected ? "bg-[#884A20] text-white" : "",
                  isToday && !isSelected ? "ring-2 ring-[#884A20] ring-offset-1" : "",
                  hasBookings && !isSelected ? "bg-[#884A20]/8 hover:bg-[#884A20]/15 cursor-pointer" : "",
                  !hasBookings && !isSelected ? "hover:bg-neutral-50 cursor-default" : "",
                ].filter(Boolean).join(" ")}
              >
                <span className={`${vulfMono.className} text-sm font-medium leading-none`}>
                  {parseInt(dateStr.split("-")[2], 10)}
                </span>
                {hasBookings && (
                  <span className={`${vulfMono.className} text-[10px] mt-1 leading-none ${isSelected ? "text-white/80" : "text-[#884A20]"}`}>
                    {totalPeople}p
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day bookings */}
      {calDate && (
        <div>
          <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-neutral-400 mb-2`}>
            {fmtDate(calDate)}
          </p>
          {dayBookings.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 py-6 text-center rounded-2xl border border-black/10 bg-white`}>
              No bookings on this day.
            </p>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
              <div className="sm:hidden divide-y divide-black/5">
                {dayBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50"
                    onClick={() => onSelect(b)}
                  >
                    <div className="min-w-0">
                      <p className={`${vulfMono.className} text-sm font-medium truncate`}>{b.time_slot} · {b.name}</p>
                      <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                        {b.party_size} {b.party_size === 1 ? "person" : "people"}
                        {b.payment_method && b.payment_method !== "stripe" && (
                          <span className="ml-2"><PaymentBadge method={b.payment_method} /></span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-brand underline underline-offset-2 shrink-0">View</span>
                  </div>
                ))}
              </div>
              <table className={`${vulfMono.className} hidden sm:table w-full text-sm`}>
                <thead>
                  <tr className="border-b border-black/10 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 hidden md:table-cell">Phone</th>
                    <th className="px-4 py-3">Party</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {dayBookings.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-black/5 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                      onClick={() => onSelect(b)}
                    >
                      <td className="px-4 py-3 font-medium">{b.time_slot}</td>
                      <td className="px-4 py-3">{b.name}</td>
                      <td className="px-4 py-3 text-neutral-500">{b.email}</td>
                      <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{b.phone ?? "—"}</td>
                      <td className="px-4 py-3">{b.party_size}</td>
                      <td className="px-4 py-3"><PaymentBadge method={b.payment_method} /></td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-brand underline underline-offset-2">View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentBadge({ method }: { method: BookingRecord["payment_method"] }) {
  if (!method) {
    return <span className={`${vulfMono.className} text-xs text-neutral-400`}>—</span>;
  }
  if (method === "stripe") {
    return <span className={`${vulfMono.className} text-xs text-neutral-800`}>Stripe</span>;
  }
  if (method === "complimentary") {
    return <span className={`${vulfMono.className} text-xs text-neutral-800`}>Complimentary</span>;
  }
  if (method === "gift_card") {
    return <span className="inline-block whitespace-nowrap rounded-full bg-yellow-100 text-yellow-700 text-[11px] font-medium px-2 py-0.5">Gift card</span>;
  }
  return <span className="inline-block whitespace-nowrap rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium px-2 py-0.5">Get Out Pass</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-16 shrink-0">{label}</span>
      <span className="text-neutral-800 break-all">{value}</span>
    </div>
  );
}
