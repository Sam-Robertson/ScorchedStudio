"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Check, Inbox, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { EquipmentReportRecord } from "@/lib/supabase";

type Category = EquipmentReportRecord["category"];
type Priority = NonNullable<EquipmentReportRecord["priority"]>;

const CATEGORIES: Category[] = ["Low Inventory", "Broken", "Other"];
const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

const CATEGORY_BADGE: Record<Category, string> = {
  "Low Inventory": "bg-blue-100 text-blue-600",
  Broken: "bg-red-100 text-red-700",
  Other: "bg-neutral-100 text-neutral-600",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-blue-100 text-blue-600",
};

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
function sortOpen(a: EquipmentReportRecord, b: EquipmentReportRecord) {
  const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
  const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
  if (pa !== pb) return pa - pb;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default function AdminRequestsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <RequestsDashboard token={token} />;
}

function RequestsDashboard({ token }: { token: string }) {
  const [reports, setReports] = useState<EquipmentReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/equipment-reports", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setReports(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function createReport(category: Category, priority: Priority | null, notes: string) {
    const res = await fetch("/api/admin/equipment-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ category, priority, notes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to submit report");
    }
    const report = await res.json();
    setReports((prev) => [report, ...prev]);
  }

  async function setStatus(id: string, status: "Open" | "Resolved") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/equipment-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeReport(id: string) {
    if (!confirm("Delete this report permanently?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/equipment-reports/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  const open = reports.filter((r) => r.status === "Open").sort(sortOpen);
  const resolved = reports
    .filter((r) => r.status === "Resolved")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <section className="container-px py-12 sm:py-16 max-w-3xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="eyebrow text-brand mb-2">Admin</p>
          <h1 className="h2 font-bold">Requests</h1>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
            Low inventory, broken equipment, and anything else staff need to flag.
          </p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 flex-shrink-0`}
        >
          {formOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {formOpen ? "CANCEL" : "REQUEST"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>
      )}

      {formOpen && (
        <ReportForm
          onCancel={() => setFormOpen(false)}
          onSubmit={async (category, priority, notes) => {
            await createReport(category, priority, notes);
            setFormOpen(false);
          }}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading…
        </div>
      ) : open.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-neutral-400">
          <Inbox className="w-10 h-10" />
          <p className={`${vulfMono.className} text-sm`}>No open requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              busy={busyId === r.id}
              onResolve={() => setStatus(r.id, "Resolved")}
              onDelete={() => removeReport(r.id)}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-12">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 hover:text-neutral-600 mb-4`}
          >
            {showResolved ? "Hide" : "Show"} Resolved ({resolved.length})
          </button>
          {showResolved && (
            <div className="space-y-3">
              {resolved.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  resolved
                  busy={busyId === r.id}
                  onReopen={() => setStatus(r.id, "Open")}
                  onDelete={() => removeReport(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ReportForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (category: Category, priority: Priority | null, notes: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<Category>("Low Inventory");
  const [priority, setPriority] = useState<Priority | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      setFormError("Please describe the request.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await onSubmit(category, priority || null, notes.trim());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm mb-8 space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={inputCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | "")}
            className={inputCls}
          >
            <option value="">None</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
          What's going on?
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. Out of cutting boards, or need more gift cards"
          className={`${inputCls} resize-none`}
        />
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className={`${vulfMono.className} rounded-xl border border-black/15 px-4 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={`${vulfMono.className} rounded-xl bg-[#519A70] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
        >
          {submitting ? "SUBMITTING…" : "SUBMIT"}
        </button>
      </div>
    </form>
  );
}

function ReportCard({
  report,
  resolved,
  busy,
  onResolve,
  onReopen,
  onDelete,
}: {
  report: EquipmentReportRecord;
  resolved?: boolean;
  busy: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-black/10 p-4 sm:p-5 shadow-sm ${
        resolved ? "bg-neutral-50 opacity-70" : "bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className={`${vulfMono.className} text-[10px] tracking-wide uppercase px-2 py-1 rounded-lg ${CATEGORY_BADGE[report.category]}`}
            >
              {report.category}
            </span>
            {report.priority && (
              <span
                className={`${vulfMono.className} text-[10px] tracking-wide uppercase px-2 py-1 rounded-lg ${PRIORITY_BADGE[report.priority]}`}
              >
                {report.priority}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-800 whitespace-pre-wrap">{report.notes}</p>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-2`}>
            {resolved
              ? `Resolved ${fmtDateTime(report.resolved_at ?? report.updated_at)}`
              : `Reported ${fmtDateTime(report.created_at)}`}
          </p>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          {resolved ? (
            <button
              onClick={onReopen}
              disabled={busy}
              aria-label="Reopen"
              className="flex items-center justify-center rounded-xl border border-black/15 bg-white p-2.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onResolve}
              disabled={busy}
              aria-label="Mark resolved"
              className="flex items-center justify-center rounded-xl bg-[#519A70] p-2.5 text-white hover:opacity-90 disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete"
            className="flex items-center justify-center rounded-xl border border-red-200 text-red-600 p-2.5 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
