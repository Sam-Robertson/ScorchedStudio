"use client";

// app/admin/courses/page.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Plus } from "lucide-react";
import type { CohortSummary, CourseRecord, RecentEnrollment } from "@/lib/courses";
import { CourseModal, type CourseModalMode } from "@/components/admin/CourseModal";

type ModalMode = CourseModalMode;

const STATUS_BADGE: Record<CourseRecord["status"], string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-neutral-100 text-neutral-500",
};

const ENROLLMENT_STATUS_LABEL: Record<RecentEnrollment["status"], string | null> = {
  confirmed: null,
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatSignupTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
  });
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [recent, setRecent] = useState<RecentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => { setToken(getAdminToken()); }, []);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/admin/courses", { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/admin/courses/overview", { headers }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([courseData, overview]) => {
        setCourses(courseData);
        if (overview) { setCohorts(overview.cohorts); setRecent(overview.recent); }
      })
      .finally(() => setLoading(false));
  }, [token]);

  function handleSaved(course: CourseRecord, isEdit: boolean) {
    setCourses((prev) => (isEdit ? prev.map((c) => (c.id === course.id ? course : c)) : [course, ...prev]));
    setModal(null);
  }

  // Past and cancelled cohorts would only crowd the fill levels that matter.
  function currentCohortsFor(courseId: string) {
    return cohorts.filter((c) => c.course_id === courseId && (c.status === "open" || c.status === "full"));
  }

  return (
    <section className="container-px py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Courses</h1>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className={`${vulfMono.className} flex items-center gap-2 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-wide text-white hover:opacity-90`}
        >
          <Plus className="w-4 h-4" />
          NEW COURSE
        </button>
      </div>

      {loading ? (
        <p className={`${vulfMono.className} text-xs text-neutral-400`}>Loading…</p>
      ) : courses.length === 0 ? (
        <p className={`${vulfMono.className} text-sm text-neutral-400 italic`}>No courses yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {courses.map((course) => {
              const current = currentCohortsFor(course.id);
              return (
                <div
                  key={course.id}
                  className="rounded-xl border border-black/10 bg-white px-4 py-3 flex items-center justify-between gap-3"
                >
                  <Link href={`/admin/courses/${course.id}`} className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">{course.name}</p>
                    <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                      {formatCents(course.default_price_cents)} · capacity {course.default_capacity} · {course.session_count} sessions
                    </p>
                    {current.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {current.map((cohort) => (
                          <span
                            key={cohort.id}
                            className={`${vulfMono.className} text-[11px] px-2 py-0.5 rounded-full ${
                              cohort.confirmed_count >= cohort.capacity
                                ? "bg-amber-100 text-amber-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {cohort.label} {cohort.confirmed_count}/{cohort.capacity}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                  <span className={`${vulfMono.className} shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[course.status]}`}>
                    {course.status === "active" ? "Active" : "Inactive"}
                  </span>
                  <button
                    onClick={() => setModal({ mode: "edit", course })}
                    className={`${vulfMono.className} shrink-0 text-xs text-brand underline underline-offset-2`}
                  >
                    Edit
                  </button>
                </div>
              );
            })}
          </div>

          <h2 className="h3 font-bold mt-10 mb-4">Recent signups</h2>
          {recent.length === 0 ? (
            <p className={`${vulfMono.className} text-sm text-neutral-400 italic`}>No signups yet.</p>
          ) : (
            <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
              {recent.map((e) => {
                const statusLabel = ENROLLMENT_STATUS_LABEL[e.status];
                return (
                  <Link
                    key={e.id}
                    href={`/admin/courses/${e.course_id}?cohort=${e.cohort_id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {e.name}
                        {statusLabel && (
                          <span className={`${vulfMono.className} ml-2 text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500`}>
                            {statusLabel}
                          </span>
                        )}
                      </p>
                      <p className={`${vulfMono.className} text-xs text-neutral-400 break-all`}>{e.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-neutral-700">{e.course_name} · {e.cohort_label}</p>
                      <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                        {formatCents(e.amount_paid_cents)} · {formatSignupTime(e.created_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {modal && token && (
        <CourseModal modal={modal} token={token} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
    </section>
  );
}
