"use client";

// app/admin/events/page.tsx
import { useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil } from "lucide-react";
import type { EventRecord } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = EventRecord["status"];

const STATUS_STYLE: Record<Status, { bg: string; text: string; dot: string; label: string }> = {
  confirmed: { bg: "bg-[#519A70]/15", text: "text-[#519A70]", dot: "bg-[#519A70]",   label: "Confirmed"  },
  tentative: { bg: "bg-amber-100",    text: "text-amber-700", dot: "bg-amber-400",    label: "Tentative"  },
  cancelled: { bg: "bg-neutral-100",  text: "text-neutral-400", dot: "bg-neutral-300", label: "Cancelled" },
};

const inputCls = "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Event Modal ───────────────────────────────────────────────────────────────

type ModalMode = { mode: "create"; date: string } | { mode: "edit"; event: EventRecord };

function EventModal({
  modal,
  token,
  onClose,
  onSaved,
  onDeleted,
}: {
  modal: ModalMode;
  token: string;
  onClose: () => void;
  onSaved: (event: EventRecord, isEdit: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const isEdit = modal.mode === "edit";
  const e = isEdit ? modal.event : null;

  const [form, setForm] = useState({
    title:         e?.title         ?? "",
    date:          e?.date          ?? (modal.mode === "create" ? modal.date : ""),
    start_time:    e?.start_time    ?? "",
    end_time:      e?.end_time      ?? "",
    group_size:    e?.group_size != null ? String(e.group_size) : "",
    contact_name:  e?.contact_name  ?? "",
    contact_email: e?.contact_email ?? "",
    notes:         e?.notes         ?? "",
    status:        (e?.status       ?? "confirmed") as Status,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      title:         form.title,
      date:          form.date,
      start_time:    form.start_time  || null,
      end_time:      form.end_time    || null,
      group_size:    form.group_size  ? parseInt(form.group_size) : null,
      contact_name:  form.contact_name  || null,
      contact_email: form.contact_email || null,
      notes:         form.notes       || null,
      status:        form.status,
    };

    const url = isEdit ? `/api/admin/events/${e!.id}` : "/api/admin/events";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) { setError("Failed to save event."); return; }
    const saved = await res.json();
    onSaved(saved, isEdit);
  }

  async function handleDelete() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    await fetch(`/api/admin/events/${e!.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    onDeleted(e!.id);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-sm`}>
            {isEdit ? "Edit Event" : "New Group Event"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>GROUP / EVENT NAME *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>DATE *</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} required />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>GROUP SIZE</label>
              <input type="number" min={1} className={inputCls} placeholder="e.g. 12" value={form.group_size} onChange={(e) => set("group_size", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>START TIME</label>
              <input type="time" className={inputCls} value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>END TIME</label>
              <input type="time" className={inputCls} value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>CONTACT NAME</label>
              <input className={inputCls} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>CONTACT EMAIL</label>
              <input type="email" className={inputCls} value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>STATUS</label>
            <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>NOTES</label>
            <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className={`${vulfMono.className} flex-1 rounded-xl bg-[#519A70] py-2.5 text-xs tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Event"}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl border border-red-200 text-red-500 px-4 py-2.5 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function EventChip({ event, onClick }: { event: EventRecord; onClick: () => void }) {
  const s = STATUS_STYLE[event.status];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left rounded-md px-1.5 py-0.5 text-[11px] truncate leading-snug ${s.bg} ${s.text} hover:opacity-80 transition-opacity`}
    >
      {fmtTime(event.start_time) && (
        <span className={`${vulfMono.className} mr-1 opacity-70`}>{fmtTime(event.start_time)}</span>
      )}
      {event.title}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents]   = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<ModalMode | null>(null);
  const [token, setToken]     = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("adminToken"));
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/events?month=${monthKey(year, month)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setEvents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, year, month]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function handleSaved(event: EventRecord, isEdit: boolean) {
    setEvents((prev) =>
      isEdit ? prev.map((e) => (e.id === event.id ? event : e)) : [...prev, event]
    );
    setModal(null);
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModal(null);
  }

  // Build calendar grid
  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfWeek(year, month);
  const totalCells = Math.ceil((startDay + totalDays) / 7) * 7;
  const cells      = Array.from({ length: totalCells }, (_, i) => {
    const day = i - startDay + 1;
    return day >= 1 && day <= totalDays ? day : null;
  });

  const eventsThisMonth = events.filter((e) => {
    const d = new Date(e.date + "T12:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  function eventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return eventsThisMonth.filter((e) => e.date === dateStr);
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Upcoming events list (next 60 days)
  const upcoming = [...events]
    .filter((e) => e.date >= todayStr && e.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <section className="container-px py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Events</h1>
        </div>
        <button
          onClick={() => {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            setModal({ mode: "create", date: dateStr });
          }}
          className={`${vulfMono.className} flex items-center gap-2 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-wide text-white hover:opacity-90`}
        >
          <Plus className="w-4 h-4" />
          NEW EVENT
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
        {/* Calendar */}
        <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className={`${vulfMono.className} text-sm font-bold`}>
              {MONTHS[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-black/8">
            {DAYS.map((d) => (
              <div key={d} className={`${vulfMono.className} text-[10px] text-neutral-400 text-center py-2`}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="py-20 text-center text-sm text-neutral-400">Loading…</div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-black/5 bg-neutral-50/50" />;
                }
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const dayEvents = eventsForDay(day);
                const isLastRow = i >= totalCells - 7;
                const isLastCol = (i + 1) % 7 === 0;

                return (
                  <div
                    key={day}
                    onClick={() => setModal({ mode: "create", date: dateStr })}
                    className={`min-h-[90px] p-1.5 cursor-pointer hover:bg-neutral-50 transition-colors ${
                      isLastRow ? "" : "border-b border-black/5"
                    } ${isLastCol ? "" : "border-r border-black/5"}`}
                  >
                    <div className={`${vulfMono.className} text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? "bg-[#519A70] text-white font-bold" : "text-neutral-500"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.map((event) => (
                        <EventChip
                          key={event.id}
                          event={event}
                          onClick={() => setModal({ mode: "edit", event })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar: upcoming + legend */}
        <div className="space-y-4">
          {/* Upcoming */}
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <p className={`${vulfMono.className} text-[10px] uppercase tracking-wide text-neutral-400 mb-3`}>Upcoming</p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-neutral-400">No upcoming events.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((event) => {
                  const d = new Date(event.date + "T12:00:00");
                  const s = STATUS_STYLE[event.status];
                  return (
                    <li key={event.id}>
                      <button
                        onClick={() => setModal({ mode: "edit", event })}
                        className="w-full text-left group"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${s.dot}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate group-hover:text-[#519A70] transition-colors">{event.title}</p>
                            <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>
                              {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {fmtTime(event.start_time) && ` · ${fmtTime(event.start_time)}`}
                              {event.group_size && ` · ${event.group_size} ppl`}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Legend */}
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <p className={`${vulfMono.className} text-[10px] uppercase tracking-wide text-neutral-400 mb-3`}>Status</p>
            <ul className="space-y-1.5">
              {(Object.entries(STATUS_STYLE) as [Status, typeof STATUS_STYLE[Status]][]).map(([key, s]) => (
                <li key={key} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                  <span className={`${vulfMono.className} text-xs text-neutral-600`}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {modal && token && (
        <EventModal
          modal={modal}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </section>
  );
}
