"use client";

// app/admin/courses/page.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Plus } from "lucide-react";
import type { CourseRecord } from "@/lib/courses";
import { CourseModal, type CourseModalMode } from "@/components/admin/CourseModal";

type ModalMode = CourseModalMode;

const STATUS_BADGE: Record<CourseRecord["status"], string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-neutral-100 text-neutral-500",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => { setToken(getAdminToken()); }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/admin/courses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setCourses(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  function handleSaved(course: CourseRecord, isEdit: boolean) {
    setCourses((prev) => (isEdit ? prev.map((c) => (c.id === course.id ? course : c)) : [course, ...prev]));
    setModal(null);
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
        <div className="space-y-2">
          {courses.map((course) => (
            <div
              key={course.id}
              className="rounded-xl border border-black/10 bg-white px-4 py-3 flex items-center justify-between gap-3"
            >
              <Link href={`/admin/courses/${course.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">{course.name}</p>
                <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                  {formatCents(course.default_price_cents)} · capacity {course.default_capacity} · {course.session_count} sessions
                </p>
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
          ))}
        </div>
      )}

      {modal && token && (
        <CourseModal modal={modal} token={token} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
    </section>
  );
}
