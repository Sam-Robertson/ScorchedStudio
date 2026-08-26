"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Bold, Bookmark, Check, Heading2, List, Pencil, Plus, Trash2, X } from "lucide-react";
import type { JobOpeningRecord, JobTemplateRecord } from "@/lib/supabase";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

const toolbarButtonCls =
  "flex items-center justify-center w-7 h-7 rounded-md border border-black/15 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800";

// Minimal markdown authoring toolbar for the description field — bold,
// section headers, and bullet lists, rendered on the public /careers page
// via lib/markdown.ts (the same remark/remark-html pipeline blog posts use).
function MarkdownTextarea({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function wrapSelection(before: string, after: string, placeholderText: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const hadSelection = start !== end;
    const selected = hadSelection ? value.slice(start, end) : placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    const selStart = start + before.length;
    const selEnd = selStart + selected.length;
    requestAnimationFrame(() => el.setSelectionRange(selStart, selEnd));
  }

  function prefixLine(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    const cursorPos = start + prefix.length;
    requestAnimationFrame(() => el.setSelectionRange(cursorPos, cursorPos));
  }

  // onMouseDown + preventDefault (not onClick alone) keeps focus in the
  // textarea the whole time a toolbar button is pressed — without it, the
  // button steals focus first, so selectionStart/selectionEnd are stale and,
  // worse, a later Enter keystroke re-activates the still-focused button
  // instead of typing a newline.
  const stopFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        <button type="button" onMouseDown={stopFocusSteal} onClick={() => wrapSelection("**", "**", "bold text")} className={toolbarButtonCls} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={stopFocusSteal} onClick={() => prefixLine("## ")} className={toolbarButtonCls} title="Section header">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={stopFocusSteal} onClick={() => prefixLine("- ")} className={toolbarButtonCls} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
      <textarea
        ref={ref}
        className={`${inputCls} min-h-[100px] font-mono text-xs`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

export default function AdminCareersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <CareersDashboard token={token} />;
}

type EditState = {
  title: string;
  location: string;
  employment_type: string;
  pay: string;
  description: string;
};

const EMPTY_EDIT: EditState = { title: "", location: "", employment_type: "", pay: "", description: "" };

function CareersDashboard({ token }: { token: string }) {
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [jobs, setJobs] = useState<JobOpeningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newJob, setNewJob] = useState<EditState>(EMPTY_EDIT);
  const [adding, setAdding] = useState(false);

  const [templates, setTemplates] = useState<JobTemplateRecord[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/careers", { headers: authHeaders })
      .then((r) => r.json())
      .then(({ jobOpenings, error: err }) => {
        if (err) throw new Error(err);
        setJobs(jobOpenings ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadTemplates = useCallback(() => {
    fetch("/api/admin/careers/templates", { headers: authHeaders })
      .then((r) => r.json())
      .then(({ templates: t, error: err }) => {
        if (err) throw new Error(err);
        setTemplates(t ?? []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); loadTemplates(); }, [load, loadTemplates]);

  function applyTemplate(template: JobTemplateRecord) {
    setNewJob({
      title: template.title,
      location: template.location ?? "",
      employment_type: template.employment_type ?? "",
      pay: template.pay ?? "",
      description: template.description,
    });
  }

  async function saveAsTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/careers/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name: templateName, ...newJob }),
      });
      const { template, error: err } = await res.json();
      if (err) throw new Error(err);
      setTemplates((prev) => [...prev, template].sort((a, b) => a.name.localeCompare(b.name)));
      setTemplateName("");
      setShowSaveTemplate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function removeTemplate(id: string) {
    try {
      const res = await fetch(`/api/admin/careers/templates/${id}`, { method: "DELETE", headers: authHeaders });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template");
    }
  }

  function startEdit(job: JobOpeningRecord) {
    setEditingId(job.id);
    setEditState({
      title: job.title,
      location: job.location ?? "",
      employment_type: job.employment_type ?? "",
      pay: job.pay ?? "",
      description: job.description,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/careers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(editState),
      });
      const { jobOpening, error: err } = await res.json();
      if (err) throw new Error(err);
      setJobs((prev) => prev.map((j) => (j.id === id ? jobOpening : j)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(job: JobOpeningRecord) {
    try {
      const res = await fetch(`/api/admin/careers/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ is_published: !job.is_published }),
      });
      const { jobOpening, error: err } = await res.json();
      if (err) throw new Error(err);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? jobOpening : j)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/careers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(newJob),
      });
      const { jobOpening, error: err } = await res.json();
      if (err) throw new Error(err);
      setJobs((prev) => [jobOpening, ...prev]);
      setNewJob(EMPTY_EDIT);
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeJob(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/careers/${id}`, { method: "DELETE", headers: authHeaders });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="h2 font-bold">Careers</h1>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
            Manage job openings shown on the public /careers page.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ADD OPENING</span>
          <span className="sm:hidden">ADD</span>
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>
      )}

      {showAdd && (
        <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
          <p className={`${vulfMono.className} font-bold text-sm mb-4`}>New Opening</p>

          {templates.length > 0 && (
            <div className="mb-4">
              <p className="block text-xs text-neutral-500 mb-1.5">Start from a template</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 rounded-full border border-black/15 bg-white pl-3 pr-1.5 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className={`${vulfMono.className} text-xs text-neutral-700 hover:text-[#884A20]`}
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTemplate(t.id)}
                      aria-label={`Delete template ${t.name}`}
                      className="p-1 rounded-full text-neutral-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={addJob} className="space-y-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Title</label>
              <input
                className={inputCls}
                placeholder="e.g. Studio Host"
                value={newJob.title}
                onChange={(e) => setNewJob((s) => ({ ...s, title: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Location (optional)</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Orem"
                  value={newJob.location}
                  onChange={(e) => setNewJob((s) => ({ ...s, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Employment type (optional)</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Part-time"
                  value={newJob.employment_type}
                  onChange={(e) => setNewJob((s) => ({ ...s, employment_type: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Pay (optional)</label>
                <input
                  className={inputCls}
                  placeholder="e.g. $15-18/hr"
                  value={newJob.pay}
                  onChange={(e) => setNewJob((s) => ({ ...s, pay: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Description</label>
              <MarkdownTextarea
                placeholder="What the role involves…"
                value={newJob.description}
                onChange={(v) => setNewJob((s) => ({ ...s, description: v }))}
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={adding}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
              >
                <Check className="w-3.5 h-3.5" />
                {adding ? "SAVING…" : "SAVE"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setError(null); }}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
              >
                <X className="w-3.5 h-3.5" />
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => setShowSaveTemplate((s) => !s)}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50 ml-auto`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                SAVE AS TEMPLATE
              </button>
            </div>
          </form>

          {showSaveTemplate && (
            <form onSubmit={saveAsTemplate} className="flex gap-2 mt-3 pt-3 border-t border-[#884A20]/20">
              <input
                className={inputCls}
                placeholder="Template name, e.g. Studio Associate"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
                autoFocus
              />
              <button
                type="submit"
                disabled={savingTemplate}
                className={`${vulfMono.className} flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
              >
                {savingTemplate ? "SAVING…" : "SAVE"}
              </button>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading openings…
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-16">No job openings yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isEditing = editingId === job.id;
            return (
              <div
                key={job.id}
                className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition-colors ${
                  isEditing ? "border-[#884A20]/30" : "border-black/10"
                } ${!job.is_published ? "opacity-60" : ""}`}
              >
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Title</label>
                      <input
                        className={inputCls}
                        value={editState.title}
                        onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Location</label>
                        <input
                          className={inputCls}
                          value={editState.location}
                          onChange={(e) => setEditState((s) => ({ ...s, location: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Employment type</label>
                        <input
                          className={inputCls}
                          value={editState.employment_type}
                          onChange={(e) => setEditState((s) => ({ ...s, employment_type: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Pay</label>
                        <input
                          className={inputCls}
                          placeholder="e.g. $15-18/hr"
                          value={editState.pay}
                          onChange={(e) => setEditState((s) => ({ ...s, pay: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Description</label>
                      <MarkdownTextarea
                        value={editState.description}
                        onChange={(v) => setEditState((s) => ({ ...s, description: v }))}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveEdit(job.id)}
                        disabled={saving}
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {saving ? "SAVING…" : "SAVE"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
                      >
                        <X className="w-3.5 h-3.5" />
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`${vulfMono.className} font-bold text-sm`}>{job.title}</p>
                        <span
                          className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full font-semibold ${
                            job.is_published
                              ? "bg-[#519A70]/15 text-[#519A70]"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {job.is_published ? "Published" : "Hidden"}
                        </span>
                      </div>
                      <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                        {[job.location, job.employment_type, job.pay].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1 whitespace-pre-line">{job.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => togglePublished(job)}
                        className={`${vulfMono.className} rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap`}
                      >
                        {job.is_published ? "Hide" : "Publish"}
                      </button>
                      <button
                        onClick={() => startEdit(job)}
                        className={`${vulfMono.className} flex items-center gap-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => removeJob(job.id)}
                        aria-label={`Delete ${job.title}`}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
