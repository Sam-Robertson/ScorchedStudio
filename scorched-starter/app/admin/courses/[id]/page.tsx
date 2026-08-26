"use client";

// app/admin/courses/[id]/page.tsx
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { ArrowLeft, Plus, X } from "lucide-react";
import type { CohortRecord, CourseRecord } from "@/lib/courses";
import { CourseModal, type CourseModalMode } from "@/components/admin/CourseModal";
import CohortDetailModal from "@/components/admin/CohortDetailModal";

const inputCls = "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

const COHORT_STATUS_BADGE: Record<CohortRecord["status"], string> = {
  open: "bg-green-100 text-green-700",
  full: "bg-amber-100 text-amber-700",
  completed: "bg-neutral-100 text-neutral-500",
  cancelled: "bg-neutral-100 text-neutral-400",
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function NewCohortModal({
  courseId,
  defaultPriceCents,
  defaultCapacity,
  token,
  onClose,
  onCreated,
}: {
  courseId: string;
  defaultPriceCents: number;
  defaultCapacity: number;
  token: string;
  onClose: () => void;
  onCreated: (cohort: CohortRecord) => void;
}) {
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState<"orem" | "slc">("orem");
  const [price, setPrice] = useState(String(defaultPriceCents / 100));
  const [capacity, setCapacity] = useState(String(defaultCapacity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/courses/${courseId}/cohorts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        label,
        location,
        price_cents: Math.round(Number(price) * 100),
        capacity: Number(capacity),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create cohort.");
      return;
    }
    onCreated(await res.json());
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-sm`}>New Cohort</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>LABEL *</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tuesday" required autoFocus />
          </div>
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>LOCATION</label>
            <select className={inputCls} value={location} onChange={(e) => setLocation(e.target.value as "orem" | "slc")}>
              <option value="orem">Orem</option>
              <option value="slc">Salt Lake City</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>PRICE ($)</label>
              <input type="number" step="0.01" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>CAPACITY</label>
              <input type="number" min={1} className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-2.5 text-xs tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
          >
            {saving ? "Creating…" : "Create Cohort"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminCourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [cohorts, setCohorts] = useState<CohortRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<CourseModalMode | null>(null);
  const [newCohortOpen, setNewCohortOpen] = useState(false);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  function load(t: string) {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/courses/${id}`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/courses/${id}/cohorts`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([c, coh]) => { setCourse(c); setCohorts(coh); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token || !id) return;
    load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  if (!token) return null;

  return (
    <section className="container-px py-10 max-w-4xl mx-auto">
      <Link href="/admin/courses" className={`${vulfMono.className} inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 mb-4`}>
        <ArrowLeft className="w-3.5 h-3.5" /> All courses
      </Link>

      {loading || !course ? (
        <p className={`${vulfMono.className} text-xs text-neutral-400`}>Loading…</p>
      ) : (
        <>
          <div className="flex items-start justify-between mb-8 gap-3">
            <div>
              <p className="eyebrow text-brand">Course</p>
              <h1 className="h2 font-bold">{course.name}</h1>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
                {fmtCents(course.default_price_cents)} default · capacity {course.default_capacity} · {course.session_count} sessions
              </p>
            </div>
            <button
              onClick={() => setEditModal({ mode: "edit", course })}
              className={`${vulfMono.className} shrink-0 rounded-lg border border-black/20 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
            >
              Edit Course
            </button>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="h3 font-bold">Cohorts</h2>
            <button
              onClick={() => setNewCohortOpen(true)}
              className={`${vulfMono.className} flex items-center gap-2 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-wide text-white hover:opacity-90`}
            >
              <Plus className="w-4 h-4" />
              NEW COHORT
            </button>
          </div>

          {cohorts.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 italic`}>No cohorts yet.</p>
          ) : (
            <div className="space-y-2">
              {cohorts.map((cohort) => (
                <button
                  key={cohort.id}
                  onClick={() => setSelectedCohortId(cohort.id)}
                  className="w-full text-left rounded-xl border border-black/10 bg-white px-4 py-3 hover:border-black/25 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{cohort.label}</p>
                    <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                      {fmtCents(cohort.price_cents)} · capacity {cohort.capacity} · {cohort.location === "orem" ? "Orem" : "Salt Lake City"}
                    </p>
                  </div>
                  <span className={`${vulfMono.className} shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${COHORT_STATUS_BADGE[cohort.status]}`}>
                    {cohort.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editModal && token && course && (
        <CourseModal
          modal={editModal}
          token={token}
          onClose={() => setEditModal(null)}
          onSaved={(saved) => { setCourse(saved); setEditModal(null); }}
        />
      )}

      {newCohortOpen && token && course && (
        <NewCohortModal
          courseId={course.id}
          defaultPriceCents={course.default_price_cents}
          defaultCapacity={course.default_capacity}
          token={token}
          onClose={() => setNewCohortOpen(false)}
          onCreated={(cohort) => { setCohorts((prev) => [...prev, cohort]); setNewCohortOpen(false); }}
        />
      )}

      {selectedCohortId && token && (
        <CohortDetailModal
          cohortId={selectedCohortId}
          token={token}
          onClose={() => setSelectedCohortId(null)}
          onChanged={(cohort) => setCohorts((prev) => prev.map((c) => (c.id === cohort.id ? cohort : c)))}
        />
      )}
    </section>
  );
}
