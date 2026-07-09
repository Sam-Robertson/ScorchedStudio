"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import clsx from "clsx";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImageIcon,
  LayoutGrid,
  LayoutList,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { SocialPostRecord } from "@/lib/supabase";

// ── Config ────────────────────────────────────────────────────────────────────

const SOCIAL_USERS = [
  { name: "Sam Robertson", initials: "SR", isAdmin: true },
  { name: "Jess", initials: "JE", isAdmin: false },
];

type SocialStatus = "Draft" | "In Review" | "Approved" | "Published";
type Priority = "High" | "Medium" | "Low";

const STATUSES: SocialStatus[] = ["Draft", "In Review", "Approved", "Published"];

const STATUS_STYLE: Record<
  SocialStatus,
  { header: string; dot: string; drop: string; badge: string }
> = {
  Draft: {
    header: "text-blue-700",
    dot: "bg-blue-400",
    drop: "ring-2 ring-blue-300",
    badge: "bg-blue-100 text-blue-700",
  },
  "In Review": {
    header: "text-amber-700",
    dot: "bg-amber-400",
    drop: "ring-2 ring-amber-300",
    badge: "bg-amber-100 text-amber-700",
  },
  Approved: {
    header: "text-green-700",
    dot: "bg-green-400",
    drop: "ring-2 ring-green-300",
    badge: "bg-green-100 text-green-700",
  },
  Published: {
    header: "text-teal-700",
    dot: "bg-teal-400",
    drop: "ring-2 ring-teal-300",
    badge: "bg-teal-100 text-teal-700",
  },
};

const PRIORITY_BADGE: Record<Priority, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-blue-100 text-blue-600",
};

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
];

function avatarColor(name: string | null) {
  if (!name) return { bg: "bg-neutral-100", text: "text-neutral-500" };
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── UserSelect ────────────────────────────────────────────────────────────────

function UserSelect({ onSelect }: { onSelect: (name: string) => void }) {
  return (
    <section className="container-px py-20 max-w-md mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <a
            href="/admin"
            className="text-neutral-400 hover:text-neutral-700 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </a>
          <p className="eyebrow text-brand">Social</p>
        </div>
        <h1 className="h2 font-bold">Who&apos;s using this?</h1>
      </div>
      <div className="space-y-3">
        {SOCIAL_USERS.map((u) => {
          const colors = avatarColor(u.name);
          return (
            <button
              key={u.name}
              onClick={() => onSelect(u.name)}
              className="w-full flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm hover:shadow-md hover:border-black/20 transition-all text-left"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${colors.bg}`}
              >
                <span className={`${vulfMono.className} text-sm font-bold ${colors.text}`}>
                  {u.initials}
                </span>
              </div>
              <div>
                <p className="font-medium text-sm">{u.name}</p>
                {u.isAdmin && (
                  <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>
                    Admin · can approve posts
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── PostModal ─────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "create"; defaultStatus?: SocialStatus }
  | { mode: "edit"; post: SocialPostRecord };

type PostForm = {
  title: string;
  caption: string;
  priority: Priority | "";
  status: SocialStatus;
  scheduled_date: string;
  notes: string;
};

function PostModal({
  modal,
  token,
  currentUser,
  onClose,
  onSaved,
}: {
  modal: ModalState;
  token: string;
  currentUser: string;
  onClose: () => void;
  onSaved: (post: SocialPostRecord, isEdit: boolean) => void;
}) {
  const isEdit = modal.mode === "edit";
  const p = isEdit ? modal.post : null;
  const defaultStatus =
    modal.mode === "create" ? (modal.defaultStatus ?? "Draft") : p!.status;

  const [form, setForm] = useState<PostForm>({
    title: p?.title ?? "",
    caption: p?.caption ?? "",
    priority: (p?.priority ?? "") as Priority | "",
    status: defaultStatus,
    scheduled_date: p?.scheduled_date ?? "",
    notes: p?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof PostForm>(key: K, val: PostForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      title: form.title,
      caption: form.caption || null,
      priority: (form.priority || null) as Priority | null,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      notes: form.notes || null,
      created_by: isEdit ? p!.created_by : currentUser,
    };

    const url = isEdit ? `/api/admin/social-posts/${p!.id}` : "/api/admin/social-posts";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Failed to save post.");
      return;
    }
    onSaved(await res.json(), isEdit);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-sm`}>
            {isEdit ? "Edit Post" : "New Post"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              TITLE *
            </label>
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              autoFocus
              placeholder="e.g. Summer burning season promo"
            />
          </div>

          {/* Description */}
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              DESCRIPTION / CAPTION
            </label>
            <textarea
              className={`${inputCls} min-h-[120px] resize-y`}
              placeholder="What's the post about? Draft copy goes here…"
              value={form.caption}
              onChange={(e) => set("caption", e.target.value)}
            />
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                PRIORITY
              </label>
              <select
                className={inputCls}
                value={form.priority}
                onChange={(e) => set("priority", e.target.value as Priority | "")}
              >
                <option value="">—</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                STATUS
              </label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value as SocialStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Scheduled date — optional */}
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              SCHEDULED DATE{" "}
              <span className="text-neutral-300 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="date"
              className={inputCls}
              value={form.scheduled_date}
              onChange={(e) => set("scheduled_date", e.target.value)}
            />
          </div>

          {/* Internal notes */}
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              INTERNAL NOTES{" "}
              <span className="text-neutral-300 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              className={`${inputCls} min-h-[72px] resize-y`}
              placeholder="Notes for the team…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-black/20 py-2.5 text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${vulfMono.className} flex-1 rounded-xl bg-[#519A70] py-2.5 text-sm tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MediaUpload ───────────────────────────────────────────────────────────────

function MediaUpload({
  post,
  token,
  isAdmin,
  onUpdate,
}: {
  post: SocialPostRecord;
  token: string;
  isAdmin: boolean;
  onUpdate: (post: SocialPostRecord) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError("");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/social-posts/${post.id}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      setUploading(false);
      if (!res.ok) {
        setUploadError("Upload failed. Check file size and try again.");
        return;
      }
      onUpdate(await res.json());
    },
    [post.id, token, onUpdate]
  );

  async function removeMedia() {
    if (!confirm("Remove this media? It will be permanently deleted.")) return;
    const res = await fetch(`/api/admin/social-posts/${post.id}/media`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) onUpdate(await res.json());
  }

  async function approve() {
    if (
      !confirm(
        "Approve this post? The uploaded media will be permanently deleted from storage — the post details are kept."
      )
    )
      return;
    const res = await fetch(`/api/admin/social-posts/${post.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) onUpdate(await res.json());
  }

  if (post.media_deleted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className={`${vulfMono.className} text-xs text-green-700 font-medium`}>
          Media approved &amp; removed
        </p>
        <p className={`${vulfMono.className} text-xs text-green-600 mt-0.5`}>
          Post details are on file.
        </p>
      </div>
    );
  }

  if (post.media_url) {
    return (
      <div className="space-y-3">
        {post.media_type === "video" ? (
          <video
            src={post.media_url}
            controls
            className="w-full rounded-xl border border-black/10 max-h-64 bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.media_url}
            alt="Post media"
            className="w-full rounded-xl border border-black/10 max-h-64 object-contain bg-neutral-50"
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-black/20 py-2 text-sm hover:bg-neutral-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Replace
          </button>
          <button
            onClick={removeMedia}
            className="flex items-center justify-center rounded-xl border border-red-200 text-red-600 py-2 px-3 text-sm hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {isAdmin && (
          <button
            onClick={approve}
            className={`${vulfMono.className} w-full flex items-center justify-center gap-2 rounded-xl bg-[#519A70] py-2.5 text-sm tracking-wide text-white hover:opacity-90`}
          >
            <Check className="w-4 h-4" />
            Approve &amp; Remove Media
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={clsx(
          "relative rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-[#519A70] bg-[#519A70]/5"
            : "border-black/15 hover:border-black/30"
        )}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[#519A70] border-t-transparent rounded-full animate-spin" />
            <p className={`${vulfMono.className} text-xs text-neutral-500`}>Uploading…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-3 mb-2">
              <ImageIcon className="w-5 h-5 text-neutral-300" />
              <Video className="w-5 h-5 text-neutral-300" />
            </div>
            <p className="text-sm text-neutral-500">Drop image or video here</p>
            <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
              or click to browse
            </p>
          </>
        )}
      </div>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Note helpers ─────────────────────────────────────────────────────────────

const NOTE_SEP = "\n\n---\n\n";

function splitNotes(raw: string | null): Array<{ header: string | null; text: string }> {
  if (!raw) return [];
  return raw.split(NOTE_SEP).map((chunk) => {
    const nl = chunk.indexOf("\n\n");
    if (nl !== -1) {
      const firstLine = chunk.slice(0, nl);
      if (firstLine.includes(" · ") && !firstLine.includes("\n")) {
        return { header: firstLine, text: chunk.slice(nl + 2) };
      }
    }
    return { header: null, text: chunk };
  });
}

function formatNoteEntry(author: string, text: string): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  return `${author.trim()} · ${date}\n\n${text.trim()}`;
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({
  post,
  token,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
  onUpdate,
}: {
  post: SocialPostRecord;
  token: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (post: SocialPostRecord) => void;
}) {
  const SOCIAL_NOTE_AUTHORS = ["Jess", "Sam Robertson"];
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [commentAs, setCommentAs] = useState(SOCIAL_NOTE_AUTHORS[0]);

  const statusStyle = STATUS_STYLE[post.status];
  const noteEntries = splitNotes(post.notes);

  async function addNote() {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    const entry = formatNoteEntry(commentAs, trimmed);
    const appended = post.notes ? `${post.notes}${NOTE_SEP}${entry}` : entry;
    setNoteSaving(true);
    const res = await fetch(`/api/admin/social-posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes: appended }),
    });
    setNoteSaving(false);
    if (res.ok) {
      onUpdate(await res.json());
      setNewNote("");
    }
  }

  async function patchStatus(status: SocialStatus) {
    const res = await fetch(`/api/admin/social-posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) onUpdate(await res.json());
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-black/10 shrink-0 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${statusStyle.dot} shrink-0`} />
              <span className={`${vulfMono.className} text-xs font-bold ${statusStyle.header}`}>
                {post.status.toUpperCase()}
              </span>
              {post.priority && (
                <span
                  className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${
                    PRIORITY_BADGE[post.priority]
                  }`}
                >
                  {post.priority}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug text-neutral-900">
              {post.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Meta */}
          {(post.scheduled_date || post.created_by) && (
            <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-black/8">
              {post.scheduled_date && (
                <div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>
                    SCHEDULED
                  </p>
                  <p className="text-sm text-neutral-700">{fmtDate(post.scheduled_date)}</p>
                </div>
              )}
              {post.created_by && (
                <div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>
                    CREATED BY
                  </p>
                  <p className="text-sm text-neutral-700">{post.created_by}</p>
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          {post.caption && (
            <div className="px-6 py-4 border-b border-black/8">
              <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-2`}>
                DESCRIPTION / CAPTION
              </p>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
                {post.caption}
              </p>
            </div>
          )}

          {/* Notes feed */}
          <div className="px-6 py-4 space-y-4 border-b border-black/8">
            <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>NOTES</p>

            {noteEntries.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {noteEntries.map((entry, i) => (
                  <div key={i} className="rounded-xl bg-neutral-50 border border-black/8 px-4 py-3">
                    {entry.header && (
                      <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-2`}>
                        {entry.header}
                      </p>
                    )}
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
                      {entry.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-black/15 overflow-hidden focus-within:border-black/30 transition-colors">
              <textarea
                className="w-full px-3 pt-2 pb-1 text-sm text-neutral-700 bg-white outline-none resize-none leading-relaxed placeholder:text-neutral-400"
                rows={4}
                placeholder="Add a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    addNote();
                  }
                }}
              />
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-t border-black/8">
                <div className="flex items-center gap-2">
                  <span className={`${vulfMono.className} text-[10px] text-neutral-400`}>as</span>
                  <select
                    className={`${vulfMono.className} text-[10px] border border-black/15 rounded-lg px-1.5 py-1 bg-white outline-none text-neutral-600`}
                    value={commentAs}
                    onChange={(e) => setCommentAs(e.target.value)}
                  >
                    {SOCIAL_NOTE_AUTHORS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  <span className={`${vulfMono.className} text-[10px] text-neutral-400 hidden sm:inline`}>⌘+Enter</span>
                </div>
                <button
                  onClick={addNote}
                  disabled={!newNote.trim() || noteSaving}
                  className={`${vulfMono.className} text-xs px-3 py-1.5 rounded-lg bg-[#519A70] text-white hover:opacity-90 disabled:opacity-40 transition-opacity`}
                >
                  {noteSaving ? "Saving…" : "Add"}
                </button>
              </div>
            </div>
          </div>

          {/* Media */}
          <div className="px-6 py-4">
            <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-3`}>MEDIA</p>
            <MediaUpload post={post} token={token} isAdmin={isAdmin} onUpdate={onUpdate} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/10 flex flex-wrap gap-2 shrink-0">
          {/* Jess: submit for review */}
          {!isAdmin && post.status === "Draft" && (
            <button
              onClick={() => patchStatus("In Review")}
              className={`${vulfMono.className} flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm tracking-wide text-white hover:opacity-90`}
            >
              Submit for Review
            </button>
          )}

          {/* Sam: mark published after approving */}
          {isAdmin && post.status === "Approved" && (
            <button
              onClick={() => patchStatus("Published")}
              className={`${vulfMono.className} flex-1 flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm tracking-wide text-white hover:opacity-90`}
            >
              <Check className="w-4 h-4" />
              Mark Published
            </button>
          )}

          <button
            onClick={onEdit}
            className="flex items-center gap-2 flex-1 justify-center rounded-xl border border-black/20 py-2.5 text-sm hover:bg-neutral-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 rounded-xl border border-red-200 text-red-600 py-2.5 px-4 text-sm hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  post: SocialPostRecord;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={clsx(
        "group bg-white rounded-xl border border-black/10 p-3.5 shadow-sm cursor-pointer hover:shadow-md transition-all select-none",
        isDragging && "opacity-40 rotate-1"
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-neutral-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{post.title}</p>

          {post.caption && (
            <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
              {post.caption}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {post.priority && (
              <span
                className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  PRIORITY_BADGE[post.priority]
                }`}
              >
                {post.priority}
              </span>
            )}
            {post.media_url && !post.media_deleted && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">
                {post.media_type === "video" ? "Video" : "Image"}
              </span>
            )}
            {post.media_deleted && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
                ✓ Approved
              </span>
            )}
          </div>

          {post.scheduled_date && (
            <p className={`${vulfMono.className} text-xs text-neutral-400 mt-2`}>
              {fmtDate(post.scheduled_date)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KanbanView ────────────────────────────────────────────────────────────────

function KanbanView({
  posts,
  onCardClick,
  onAddPost,
  onDrop,
}: {
  posts: SocialPostRecord[];
  onCardClick: (post: SocialPostRecord) => void;
  onAddPost: (status: SocialStatus) => void;
  onDrop: (postId: string, status: SocialStatus) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<SocialStatus | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {STATUSES.map((status) => {
        const colPosts = posts.filter((p) => p.status === status);
        const style = STATUS_STYLE[status];
        const isOver = dragOverCol === status;

        return (
          <div
            key={status}
            className={clsx(
              "flex flex-col rounded-2xl bg-neutral-50 border border-black/8 transition-all min-h-[200px]",
              isOver && style.drop
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverCol(null);
              }
            }}
            onDrop={() => {
              if (draggedId) onDrop(draggedId, status);
              setDragOverCol(null);
              setDraggedId(null);
            }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className={`${vulfMono.className} text-xs font-bold ${style.header}`}>
                  {status.toUpperCase()}
                </span>
                <span className="text-xs text-neutral-400 font-medium">{colPosts.length}</span>
              </div>
              <button
                onClick={() => onAddPost(status)}
                className="text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
              {colPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onClick={() => onCardClick(post)}
                  onDragStart={() => setDraggedId(post.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverCol(null);
                  }}
                  isDragging={draggedId === post.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({
  posts,
  onPostClick,
}: {
  posts: SocialPostRecord[];
  onPostClick: (post: SocialPostRecord) => void;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function postsOnDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return posts.filter((p) => p.scheduled_date === dateStr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-neutral-100">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className={`${vulfMono.className} text-sm font-bold`}>{monthLabel}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-neutral-100">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className={`${vulfMono.className} text-center text-[10px] text-neutral-400 py-2`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-black/5 rounded-2xl overflow-hidden border border-black/10">
        {cells.map((day, i) => {
          const dayPosts = day ? postsOnDay(day) : [];
          const isToday =
            day !== null &&
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;

          return (
            <div key={i} className={clsx("bg-white min-h-[90px] p-2", !day && "bg-neutral-50/60")}>
              {day && (
                <>
                  <span
                    className={clsx(
                      vulfMono.className,
                      "text-xs inline-flex items-center justify-center w-6 h-6 rounded-full mb-1",
                      isToday ? "bg-[#884A20] text-white" : "text-neutral-500"
                    )}
                  >
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((post) => (
                      <button
                        key={post.id}
                        onClick={() => onPostClick(post)}
                        className={clsx(
                          "w-full text-left text-[10px] px-1.5 py-0.5 rounded font-medium truncate leading-4",
                          STATUS_STYLE[post.status].badge
                        )}
                      >
                        {post.title}
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <p className={`${vulfMono.className} text-[9px] text-neutral-400 pl-1.5`}>
                        +{dayPosts.length - 3} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({
  posts,
  onRowClick,
}: {
  posts: SocialPostRecord[];
  onRowClick: (post: SocialPostRecord) => void;
}) {
  return (
    <div className="rounded-2xl border border-black/10 overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px]">
          <thead className="bg-neutral-50 border-b border-black/10">
            <tr>
              {["TITLE", "PRIORITY", "STATUS", "SCHEDULED", "MEDIA"].map((h) => (
                <th key={h} className="px-4 py-3 text-left">
                  <span className={`${vulfMono.className} text-xs text-neutral-400`}>{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post, i) => (
              <tr
                key={post.id}
                onClick={() => onRowClick(post)}
                className={clsx(
                  "border-b border-black/5 cursor-pointer hover:bg-neutral-50 transition-colors",
                  i % 2 !== 0 && "bg-neutral-50/50"
                )}
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{post.title}</p>
                  {post.caption && (
                    <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-[200px]">
                      {post.caption}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {post.priority ? (
                    <span
                      className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${
                        PRIORITY_BADGE[post.priority]
                      }`}
                    >
                      {post.priority}
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${
                      STATUS_STYLE[post.status].badge
                    }`}
                  >
                    {post.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-neutral-600">
                    {fmtDate(post.scheduled_date) ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {post.media_deleted ? (
                    <span className="text-xs text-green-600">✓ Approved</span>
                  ) : post.media_url ? (
                    <span className="text-xs text-violet-600">
                      {post.media_type === "video" ? "Video" : "Image"}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-neutral-400 text-sm">
                  No posts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SocialDashboard ───────────────────────────────────────────────────────────

type View = "kanban" | "calendar" | "list";

function SocialDashboard({
  token,
  currentUser,
  onSwitchUser,
}: {
  token: string;
  currentUser: string;
  onSwitchUser: () => void;
}) {
  const userConfig = SOCIAL_USERS.find((u) => u.name === currentUser);
  const isAdmin = userConfig?.isAdmin ?? false;

  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("kanban");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detail, setDetail] = useState<SocialPostRecord | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch("/api/admin/social-posts", { headers })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setPosts(d);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaved(post: SocialPostRecord, isEdit: boolean) {
    setPosts((prev) =>
      isEdit ? prev.map((p) => (p.id === post.id ? post : p)) : [post, ...prev]
    );
    setModal(null);
    setDetail(null);
  }

  async function handleDrop(postId: string, newStatus: SocialStatus) {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === newStatus) return;
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p)));
    const res = await fetch(`/api/admin/social-posts/${postId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: post.status } : p))
      );
    }
  }

  async function handleDelete(postId: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDetail(null);
    setModal(null);
    const res = await fetch(`/api/admin/social-posts/${postId}`, {
      method: "DELETE",
      headers,
    });
    if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handleUpdate(updated: SocialPostRecord) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setDetail(updated);
  }

  const colors = avatarColor(currentUser);
  const counts = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: posts.filter((p) => p.status === s).length }),
    {} as Record<SocialStatus, number>
  );

  return (
    <section className="container-px py-10 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <a href="/admin" className="text-neutral-400 hover:text-neutral-700 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </a>
        <div className="flex-1 min-w-0">
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Social Media</h1>
        </div>

        <button
          onClick={onSwitchUser}
          className="flex items-center gap-2 rounded-xl border border-black/15 px-3 py-2 hover:bg-neutral-50 transition-colors"
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${colors.bg}`}
          >
            <span className={`${vulfMono.className} text-[10px] font-bold ${colors.text}`}>
              {initials(currentUser)}
            </span>
          </div>
          <span className="text-sm hidden sm:inline">{currentUser}</span>
        </button>

        <div className="flex rounded-xl border border-black/15 overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            title="Kanban"
            className={clsx("p-2 transition-colors", view === "kanban" ? "bg-black text-white" : "hover:bg-neutral-100")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("calendar")}
            title="Calendar"
            className={clsx("p-2 transition-colors", view === "calendar" ? "bg-black text-white" : "hover:bg-neutral-100")}
          >
            <CalendarDays className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            title="List"
            className={clsx("p-2 transition-colors", view === "list" ? "bg-black text-white" : "hover:bg-neutral-100")}
          >
            <LayoutList className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setModal({ mode: "create" })}
          className={`${vulfMono.className} flex items-center gap-2 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-wide text-white hover:opacity-90`}
        >
          <Plus className="w-4 h-4" />
          NEW POST
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-xl bg-white border border-black/10 px-4 py-2.5 shrink-0"
          >
            <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[s].dot}`} />
            <span className={`${vulfMono.className} text-xs font-medium ${STATUS_STYLE[s].header}`}>
              {s}
            </span>
            <span className={`${vulfMono.className} text-xs text-neutral-400`}>{counts[s]}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl bg-white border border-black/10 px-4 py-2.5 shrink-0">
          <span className={`${vulfMono.className} text-xs font-medium text-neutral-600`}>Total</span>
          <span className={`${vulfMono.className} text-xs text-neutral-400`}>{posts.length}</span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-neutral-400 text-sm">Loading posts…</div>
      ) : view === "kanban" ? (
        <KanbanView
          posts={posts}
          onCardClick={setDetail}
          onAddPost={(status) => setModal({ mode: "create", defaultStatus: status })}
          onDrop={handleDrop}
        />
      ) : view === "calendar" ? (
        <CalendarView posts={posts} onPostClick={setDetail} />
      ) : (
        <ListView posts={posts} onRowClick={setDetail} />
      )}

      {modal && (
        <PostModal
          modal={modal}
          token={token}
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {detail && (
        <DetailPanel
          post={detail}
          token={token}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setModal({ mode: "edit", post: detail });
            setDetail(null);
          }}
          onDelete={() => handleDelete(detail.id)}
          onUpdate={handleUpdate}
        />
      )}
    </section>
  );
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export default function AdminSocialPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
    const user = sessionStorage.getItem("socialUser");
    if (user) setCurrentUser(user);
  }, [router]);

  if (!token) return null;
  if (!currentUser)
    return (
      <UserSelect
        onSelect={(name) => {
          sessionStorage.setItem("socialUser", name);
          setCurrentUser(name);
        }}
      />
    );

  return (
    <SocialDashboard
      token={token}
      currentUser={currentUser}
      onSwitchUser={() => {
        sessionStorage.removeItem("socialUser");
        setCurrentUser(null);
      }}
    />
  );
}
