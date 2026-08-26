"use client";

import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import { X } from "lucide-react";
import type { CourseRecord, CurriculumWeek } from "@/lib/courses";

const inputCls = "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

export type CourseModalMode = { mode: "create" } | { mode: "edit"; course: CourseRecord };
type ModalMode = CourseModalMode;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function curriculumToText(curriculum: CurriculumWeek[]): string {
  return curriculum
    .map((w) => `${w.title}\n${w.topics.map((t) => `- ${t}`).join("\n")}`)
    .join("\n\n");
}

// Turns simple "Title\n- topic\n- topic\n\nTitle 2\n- topic" text into
// CurriculumWeek[] so admins don't have to hand-edit JSON. Week numbers are
// assigned by block order.
function textToCurriculum(text: string): CurriculumWeek[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const [title, ...rest] = lines;
      const topics = rest.map((l) => l.replace(/^-\s*/, ""));
      return { week: i + 1, title: title ?? `Week ${i + 1}`, topics };
    });
}

export function CourseModal({
  modal,
  token,
  onClose,
  onSaved,
}: {
  modal: ModalMode;
  token: string;
  onClose: () => void;
  onSaved: (course: CourseRecord, isEdit: boolean) => void;
}) {
  const isEdit = modal.mode === "edit";
  const c = isEdit ? modal.course : null;

  const [form, setForm] = useState({
    name: c?.name ?? "",
    slug: c?.slug ?? "",
    description: c?.description ?? "",
    curriculumText: c ? curriculumToText(c.curriculum) : "",
    default_price_cents: c ? String(c.default_price_cents / 100) : "",
    default_capacity: c ? String(c.default_capacity) : "",
    session_count: c ? String(c.session_count) : "",
    session_duration_minutes: c ? String(c.session_duration_minutes) : "",
    status: (c?.status ?? "active") as CourseRecord["status"],
  });
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      curriculum: textToCurriculum(form.curriculumText),
      default_price_cents: Math.round(Number(form.default_price_cents) * 100),
      default_capacity: Number(form.default_capacity),
      session_count: Number(form.session_count),
      session_duration_minutes: Number(form.session_duration_minutes),
      status: form.status,
    };

    const url = isEdit ? `/api/admin/courses/${c!.id}` : "/api/admin/courses";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save course.");
      return;
    }
    const saved = await res.json();
    onSaved(saved, isEdit);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 overflow-y-auto z-50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
            <h2 className={`${vulfMono.className} font-bold text-sm`}>
              {isEdit ? "Edit Course" : "New Course"}
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>NAME *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!slugTouched) set("slug", slugify(e.target.value));
                }}
                required
                autoFocus
              />
            </div>

            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>SLUG *</label>
              <input
                className={inputCls}
                value={form.slug}
                onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }}
                required
              />
            </div>

            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>DESCRIPTION *</label>
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                required
              />
            </div>

            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                CURRICULUM — one week per block, first line is the title, following lines are topics prefixed with &quot;-&quot;
              </label>
              <textarea
                className={`${inputCls} min-h-[180px] resize-y font-mono text-xs`}
                value={form.curriculumText}
                onChange={(e) => set("curriculumText", e.target.value)}
                placeholder={"Foundations and control\n- Tools, tips, and wood types\n- Safety\n\nShading, texture, and value\n- Gradients"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>DEFAULT PRICE ($) *</label>
                <input type="number" step="0.01" min={0} className={inputCls} value={form.default_price_cents} onChange={(e) => set("default_price_cents", e.target.value)} required />
              </div>
              <div>
                <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>DEFAULT CAPACITY *</label>
                <input type="number" min={1} className={inputCls} value={form.default_capacity} onChange={(e) => set("default_capacity", e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>SESSION COUNT *</label>
                <input type="number" min={1} className={inputCls} value={form.session_count} onChange={(e) => set("session_count", e.target.value)} required />
              </div>
              <div>
                <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>SESSION LENGTH (MIN) *</label>
                <input type="number" min={1} className={inputCls} value={form.session_duration_minutes} onChange={(e) => set("session_duration_minutes", e.target.value)} required />
              </div>
            </div>

            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>STATUS</label>
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as CourseRecord["status"])}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-2.5 text-xs tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Course"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
