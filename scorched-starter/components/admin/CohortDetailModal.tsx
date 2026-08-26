"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { X, Trash2 } from "lucide-react";
import type {
  CohortAvailability,
  CohortRecord,
  CohortSessionRecord,
  CourseEnrollmentRecord,
  CourseWaitlistRecord,
} from "@/lib/courses";

const inputCls = "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

type CohortDetail = {
  cohort: CohortRecord;
  sessions: CohortSessionRecord[];
  enrollments: CourseEnrollmentRecord[];
  waitlist: CourseWaitlistRecord[];
  availability: CohortAvailability | null;
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Quotes any field containing a comma, quote, or newline — enrollee names
// routinely have commas ("Smith, Jr.") that would otherwise split columns.
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvField).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CohortDetailModal({
  cohortId,
  token,
  onClose,
  onChanged,
}: {
  cohortId: string;
  token: string;
  onClose: () => void;
  onChanged: (cohort: CohortRecord) => void;
}) {
  const [detail, setDetail] = useState<CohortDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ label: "", location: "orem" as "orem" | "slc", price: "", capacity: "", status: "open" as CohortRecord["status"] });
  const [saving, setSaving] = useState(false);

  const [newSession, setNewSession] = useState({ session_number: "", session_date: "", start_time: "", end_time: "" });
  const [addingSession, setAddingSession] = useState(false);

  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/courses/cohorts/${cohortId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject("Failed to load cohort")))
      .then((data: CohortDetail) => {
        setDetail(data);
        setForm({
          label: data.cohort.label,
          location: data.cohort.location,
          price: String(data.cohort.price_cents / 100),
          capacity: String(data.cohort.capacity),
          status: data.cohort.status,
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cohortId, token]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveCohort(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/courses/cohorts/${cohortId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        label: form.label,
        location: form.location,
        price_cents: Math.round(Number(form.price) * 100),
        capacity: Number(form.capacity),
        status: form.status,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save cohort.");
      return;
    }
    const cohort = await res.json();
    onChanged(cohort);
    load();
  }

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    setAddingSession(true);
    setError(null);
    const res = await fetch(`/api/admin/courses/cohorts/${cohortId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        session_number: Number(newSession.session_number),
        session_date: newSession.session_date,
        start_time: newSession.start_time,
        end_time: newSession.end_time,
      }),
    });
    setAddingSession(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add session.");
      return;
    }
    setNewSession({ session_number: "", session_date: "", start_time: "", end_time: "" });
    load();
  }

  async function handleDeleteSession(id: string) {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await fetch(`/api/admin/courses/sessions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  async function handleNotify(waitlistId: string) {
    setNotifyingId(waitlistId);
    setError(null);
    const res = await fetch(`/api/admin/courses/cohorts/${cohortId}/waitlist/${waitlistId}/notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifyingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to send notification.");
      return;
    }
    load();
  }

  function exportRosterCsv() {
    if (!detail) return;
    const rows = [
      ["Name", "Email", "Phone", "Status", "Amount Paid", "Enrolled At"],
      ...detail.enrollments.map((e) => [
        e.name,
        e.email,
        e.phone ?? "",
        e.status,
        fmtCents(e.amount_paid_cents),
        new Date(e.created_at).toLocaleString(),
      ]),
    ];
    downloadCsv(`${detail.cohort.label}-roster.csv`, rows);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 overflow-y-auto z-50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 shrink-0">
            <h2 className={`${vulfMono.className} font-bold text-sm`}>
              {detail ? `${detail.cohort.label} cohort` : "Cohort"}
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {loading || !detail ? (
              <p className={`${vulfMono.className} text-xs text-neutral-400`}>Loading…</p>
            ) : (
              <>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

                {detail.availability && (
                  <p className={`${vulfMono.className} text-xs text-neutral-500`}>
                    {detail.availability.seats_remaining} of {detail.availability.capacity} seats remaining
                    {detail.waitlist.filter((w) => w.status === "waiting").length > 0 &&
                      ` · ${detail.waitlist.filter((w) => w.status === "waiting").length} waiting`}
                  </p>
                )}

                {/* Cohort fields */}
                <form onSubmit={handleSaveCohort} className="rounded-xl border border-black/10 p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Label</label>
                    <input className={inputCls} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Location</label>
                    <select className={inputCls} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value as "orem" | "slc" }))}>
                      <option value="orem">Orem</option>
                      <option value="slc">Salt Lake City</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Price ($)</label>
                    <input type="number" step="0.01" min={0} className={inputCls} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Capacity</label>
                    <input type="number" min={1} className={inputCls} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} required />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-neutral-500 mb-1">Status</label>
                    <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CohortRecord["status"] }))}>
                      <option value="open">Open</option>
                      <option value="full">Full</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className={`${vulfMono.className} rounded-lg bg-[#519A70] px-4 py-2 text-xs tracking-[0.1em] text-white font-semibold hover:opacity-90 disabled:opacity-40`}
                    >
                      {saving ? "Saving…" : "Save Cohort"}
                    </button>
                  </div>
                </form>

                {/* Sessions */}
                <div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-2`}>SESSIONS</p>
                  <div className="space-y-1 mb-3">
                    {detail.sessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg bg-neutral-50 border border-black/8 px-3 py-2 text-xs">
                        <span>
                          #{s.session_number} — {s.session_date} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </span>
                        <button onClick={() => handleDeleteSession(s.id)} className="text-neutral-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {detail.sessions.length === 0 && (
                      <p className="text-xs text-neutral-400 italic">No sessions scheduled yet.</p>
                    )}
                  </div>
                  <form onSubmit={handleAddSession} className="grid grid-cols-5 gap-2 items-end">
                    <div>
                      <label className="block text-[10px] text-neutral-500 mb-1">#</label>
                      <input type="number" min={1} className={inputCls} value={newSession.session_number} onChange={(e) => setNewSession((s) => ({ ...s, session_number: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 mb-1">Date</label>
                      <input type="date" className={inputCls} value={newSession.session_date} onChange={(e) => setNewSession((s) => ({ ...s, session_date: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 mb-1">Start</label>
                      <input type="time" className={inputCls} value={newSession.start_time} onChange={(e) => setNewSession((s) => ({ ...s, start_time: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 mb-1">End</label>
                      <input type="time" className={inputCls} value={newSession.end_time} onChange={(e) => setNewSession((s) => ({ ...s, end_time: e.target.value }))} required />
                    </div>
                    <button
                      type="submit"
                      disabled={addingSession}
                      className={`${vulfMono.className} rounded-lg border border-black/20 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40`}
                    >
                      {addingSession ? "Adding…" : "Add"}
                    </button>
                  </form>
                </div>

                {/* Enrollments roster */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>ENROLLMENTS ({detail.enrollments.length})</p>
                    <button
                      onClick={exportRosterCsv}
                      disabled={detail.enrollments.length === 0}
                      className={`${vulfMono.className} text-[10px] text-brand underline underline-offset-2 disabled:opacity-40 disabled:no-underline`}
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="space-y-1">
                    {detail.enrollments.map((en) => (
                      <div key={en.id} className="rounded-lg bg-neutral-50 border border-black/8 px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-700 truncate">{en.name}</p>
                          <p className="text-neutral-500 truncate">{en.email}{en.phone ? ` · ${en.phone}` : ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-neutral-700">{fmtCents(en.amount_paid_cents)}</p>
                          <p className="text-neutral-400">{en.status}</p>
                        </div>
                      </div>
                    ))}
                    {detail.enrollments.length === 0 && (
                      <p className="text-xs text-neutral-400 italic">No enrollments yet.</p>
                    )}
                  </div>
                </div>

                {/* Waitlist */}
                <div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-2`}>WAITLIST ({detail.waitlist.length})</p>
                  <div className="space-y-1">
                    {detail.waitlist.map((w) => (
                      <div key={w.id} className="rounded-lg bg-neutral-50 border border-black/8 px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-700 truncate">{w.name}</p>
                          <p className="text-neutral-500 truncate">{w.email}{w.phone ? ` · ${w.phone}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-neutral-400">{w.status}</span>
                          {w.status === "waiting" && (
                            <button
                              onClick={() => handleNotify(w.id)}
                              disabled={notifyingId === w.id}
                              className={`${vulfMono.className} rounded-lg bg-[#884A20] px-3 py-1.5 text-[10px] tracking-wide text-white hover:opacity-90 disabled:opacity-40`}
                            >
                              {notifyingId === w.id ? "Sending…" : "Notify"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {detail.waitlist.length === 0 && (
                      <p className="text-xs text-neutral-400 italic">No one on the waitlist.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
