"use client";

// app/admin/projects/page.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import {
  ChevronLeft,
  LayoutGrid,
  List,
  Plus,
  X,
  Pencil,
  Trash2,
  GripVertical,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { TaskRecord } from "@/lib/supabase";

// ── Types & constants ─────────────────────────────────────────────────────────

type Col = TaskRecord["board_column"];
type Priority = "High" | "Medium" | "Low";

const COLUMNS: Col[] = ["To do", "Doing", "Done", "Blocked"];

const PROJECT_USERS = [
  { name: "Sam Robertson", initials: "SR" },
  { name: "Pearson Brown", initials: "PB" },
];

const COL_STYLE: Record<Col, { header: string; dot: string; drop: string }> = {
  "To do": {
    header: "text-blue-700",
    dot: "bg-blue-400",
    drop: "ring-2 ring-blue-300",
  },
  Doing: {
    header: "text-amber-700",
    dot: "bg-amber-400",
    drop: "ring-2 ring-amber-300",
  },
  Done: {
    header: "text-green-700",
    dot: "bg-green-400",
    drop: "ring-2 ring-green-300",
  },
  Blocked: {
    header: "text-red-700",
    dot: "bg-red-400",
    drop: "ring-2 ring-red-300",
  },
};

const PRIORITY_BADGE: Record<Priority, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-blue-100 text-blue-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(due: string | null) {
  if (!due) return false;
  return new Date(due + "T00:00:00") < new Date();
}

function initials(name: string | null) {
  if (!name) return null;
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_PALETTE = [
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
];

function avatarColor(name: string | null): { bg: string; text: string } {
  if (!name) return { bg: "bg-neutral-100", text: "text-neutral-500" };
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// ── UserSelect ────────────────────────────────────────────────────────────────

function UserSelect({ onSelect }: { onSelect: (name: string) => void }) {
  return (
    <section className="container-px py-20 max-w-md mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-700 transition-colors shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </a>
          <p className="eyebrow text-brand">Projects</p>
        </div>
        <h1 className="h2 font-bold">Who&apos;s using this?</h1>
      </div>
      <div className="space-y-3">
        {PROJECT_USERS.map((u) => {
          const colors = avatarColor(u.name);
          return (
            <button
              key={u.name}
              onClick={() => onSelect(u.name)}
              className="w-full flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm hover:shadow-md hover:border-black/20 transition-all text-left"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${colors.bg}`}>
                <span className={`${vulfMono.className} text-sm font-bold ${colors.text}`}>{u.initials}</span>
              </div>
              <span className="font-medium text-sm">{u.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── TaskModal ─────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "create"; column: Col }
  | { mode: "edit"; task: TaskRecord };

function TaskModal({
  modal,
  token,
  onClose,
  onSaved,
}: {
  modal: ModalState;
  token: string;
  onClose: () => void;
  onSaved: (task: TaskRecord, isEdit: boolean) => void;
}) {
  const isEdit = modal.mode === "edit";
  const t = isEdit ? modal.task : null;

  const [form, setForm] = useState({
    name: t?.name ?? "",
    notes: t?.notes ?? "",
    board_column: (t?.board_column ?? (modal.mode === "create" ? modal.column : "To do")) as Col,
    priority: t?.priority ?? "",
    assignee: t?.assignee ?? "",
    assignee_email: t?.assignee_email ?? "",
    due_date: t?.due_date ?? "",
    start_date: t?.start_date ?? "",
    sprint_dates: t?.sprint_dates ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      name: form.name,
      notes: form.notes || null,
      board_column: form.board_column,
      priority: (form.priority || null) as Priority | null,
      status: null,
      assignee: form.assignee || null,
      assignee_email: form.assignee_email || null,
      due_date: form.due_date || null,
      start_date: form.start_date || null,
      sprint_dates: form.sprint_dates || null,
    };

    const url = isEdit ? `/api/admin/tasks/${t!.id}` : "/api/admin/tasks";
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
      setError("Failed to save task.");
      return;
    }
    const saved = await res.json();
    onSaved(saved, isEdit);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className={`${vulfMono.className} font-bold text-sm`}>
            {isEdit ? "Edit Task" : "New Task"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              NAME *
            </label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                COLUMN
              </label>
              <select
                className={inputCls}
                value={form.board_column}
                onChange={(e) => set("board_column", e.target.value)}
              >
                {COLUMNS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                PRIORITY
              </label>
              <select
                className={inputCls}
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                <option value="">—</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                START DATE
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                DUE DATE
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.due_date}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                SPRINT
              </label>
              <input
                className={inputCls}
                placeholder="e.g. March 1–15"
                value={form.sprint_dates}
                onChange={(e) => set("sprint_dates", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                ASSIGNEE
              </label>
              <input
                className={inputCls}
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
              />
            </div>
            <div>
              <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
                ASSIGNEE EMAIL
              </label>
              <input
                type="email"
                className={inputCls}
                value={form.assignee_email}
                onChange={(e) => set("assignee_email", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1`}>
              NOTES
            </label>
            <textarea
              className={`${inputCls} min-h-[100px] resize-y`}
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
  const header = author.trim() ? `${author.trim()} · ${date}` : date;
  return `${header}\n\n${text.trim()}`;
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({
  task,
  token,
  currentUser,
  onClose,
  onEdit,
  onDelete,
  onTaskUpdate,
}: {
  task: TaskRecord;
  token: string;
  currentUser: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTaskUpdate: (task: TaskRecord) => void;
}) {
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  async function addNote() {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    const entry = formatNoteEntry(currentUser, trimmed);
    const appended = task.notes ? `${task.notes}${NOTE_SEP}${entry}` : entry;
    setNoteSaving(true);
    const res = await fetch(`/api/admin/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes: appended }),
    });
    setNoteSaving(false);
    if (res.ok) {
      const updated = await res.json();
      onTaskUpdate(updated);
      setNewNote("");
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addNote();
    }
  }

  const colStyle = COL_STYLE[task.board_column];
  const noteEntries = splitNotes(task.notes);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-black/10 shrink-0 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${colStyle.dot} shrink-0`} />
              <span className={`${vulfMono.className} text-xs font-bold ${colStyle.header}`}>
                {task.board_column.toUpperCase()}
              </span>
              {task.priority && (
                <span className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority as Priority]}`}>
                  {task.priority}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug text-neutral-900">{task.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Metadata */}
          <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-black/8">
            {task.assignee && (
              <div className="col-span-2">
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>ASSIGNEE</p>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${avatarColor(task.assignee).bg}`}>
                    <span className={`${vulfMono.className} text-[10px] font-bold ${avatarColor(task.assignee).text}`}>
                      {initials(task.assignee)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{task.assignee}</p>
                    {task.assignee_email && (
                      <p className="text-xs text-neutral-400">{task.assignee_email}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {task.start_date && (
              <div>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>START</p>
                <p className="text-sm text-neutral-700">{fmtDate(task.start_date)}</p>
              </div>
            )}
            {task.due_date && (
              <div>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>DUE</p>
                <p className={`text-sm font-medium ${isOverdue(task.due_date) && task.board_column !== "Done" ? "text-red-600" : "text-neutral-700"}`}>
                  {fmtDate(task.due_date)}
                </p>
              </div>
            )}
            {task.sprint_dates && (
              <div className="col-span-2">
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-1`}>SPRINT</p>
                <p className="text-sm text-neutral-700">{task.sprint_dates}</p>
              </div>
            )}
          </div>

          {/* Notes feed */}
          <div className="px-6 py-4 space-y-4">
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

            {/* Add note */}
            <div className="rounded-xl border border-black/15 overflow-hidden focus-within:border-black/30 transition-colors">
              <textarea
                className="w-full px-3 pt-2 pb-1 text-sm text-neutral-700 bg-white outline-none resize-none leading-relaxed placeholder:text-neutral-400"
                rows={3}
                placeholder="Add a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={handleNoteKeyDown}
              />
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-t border-black/8">
                <span className={`${vulfMono.className} text-[10px] text-neutral-400`}>⌘ + Enter to save</span>
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/10 flex gap-2 shrink-0">
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

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: TaskRecord;
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
      className={`group bg-white rounded-xl border border-black/10 p-3.5 shadow-sm cursor-pointer hover:shadow-md transition-all select-none ${
        isDragging ? "opacity-40 rotate-1" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-neutral-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{task.name}</p>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {task.priority && (
              <span
                className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority as Priority]}`}
              >
                {task.priority}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-2.5">
            {task.due_date ? (
              <span
                className={`${vulfMono.className} text-xs ${
                  isOverdue(task.due_date) && task.board_column !== "Done"
                    ? "text-red-500"
                    : "text-neutral-400"
                }`}
              >
                {fmtDate(task.due_date)}
              </span>
            ) : (
              <span />
            )}
            {task.assignee && (
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${avatarColor(task.assignee).bg}`}>
                <span className={`${vulfMono.className} text-[10px] font-bold ${avatarColor(task.assignee).text}`}>
                  {initials(task.assignee)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KanbanView ────────────────────────────────────────────────────────────────

function KanbanView({
  tasks,
  onCardClick,
  onAddTask,
  onDrop,
}: {
  tasks: TaskRecord[];
  onCardClick: (task: TaskRecord) => void;
  onAddTask: (col: Col) => void;
  onDrop: (taskId: string, col: Col) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Col | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-0">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.board_column === col);
        const style = COL_STYLE[col];
        const isOver = dragOverCol === col;

        return (
          <div
            key={col}
            className={`flex-shrink-0 w-72 flex flex-col rounded-2xl bg-neutral-50 border border-black/8 transition-all ${
              isOver ? style.drop : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverCol(null);
              }
            }}
            onDrop={() => {
              if (draggedId) {
                onDrop(draggedId, col);
              }
              setDragOverCol(null);
              setDraggedId(null);
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className={`${vulfMono.className} text-xs font-bold ${style.header}`}>
                  {col.toUpperCase()}
                </span>
                <span className="text-xs text-neutral-400 font-medium">{colTasks.length}</span>
              </div>
              <button
                onClick={() => onAddTask(col)}
                className="text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Cards */}
            <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onCardClick(task)}
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverCol(null);
                  }}
                  isDragging={draggedId === task.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({
  tasks,
  onRowClick,
}: {
  tasks: TaskRecord[];
  onRowClick: (task: TaskRecord) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof TaskRecord>("board_column");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  function toggleSort(key: keyof TaskRecord) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const colOrder: Record<Col, number> = { "To do": 0, Doing: 1, Done: 2, Blocked: 3 };
  const priOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

  const sorted = [...tasks].sort((a, b) => {
    let av: unknown = a[sortKey];
    let bv: unknown = b[sortKey];
    if (sortKey === "board_column") {
      av = colOrder[a.board_column];
      bv = colOrder[b.board_column];
    }
    if (sortKey === "priority") {
      av = priOrder[a.priority ?? ""] ?? 99;
      bv = priOrder[b.priority ?? ""] ?? 99;
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
  });

  function Th({
    label,
    sortable,
    col,
  }: {
    label: string;
    sortable?: keyof TaskRecord;
    col?: string;
  }) {
    const active = sortable && sortKey === sortable;
    return (
      <th
        className={`px-4 py-3 text-left ${col ?? ""} ${sortable ? "cursor-pointer select-none hover:bg-black/5" : ""}`}
        onClick={sortable ? () => toggleSort(sortable) : undefined}
      >
        <span className={`${vulfMono.className} text-xs ${active ? "text-black" : "text-neutral-400"}`}>
          {label} {active ? (sortDir === 1 ? "↑" : "↓") : ""}
        </span>
      </th>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-neutral-50 border-b border-black/10">
            <tr>
              <Th label="NAME" sortable="name" />
              <Th label="STATUS" sortable="board_column" col="w-28" />
              <Th label="PRIORITY" sortable="priority" col="w-24" />
              <Th label="ASSIGNEE" col="w-32" />
              <Th label="DUE DATE" sortable="due_date" col="w-32" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((task, i) => (
              <tr
                key={task.id}
                onClick={() => onRowClick(task)}
                className={`border-b border-black/5 cursor-pointer hover:bg-neutral-50 transition-colors ${
                  i % 2 === 0 ? "" : "bg-neutral-50/50"
                }`}
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{task.name}</p>
                  {task.sprint_dates && (
                    <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>
                      {task.sprint_dates}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${COL_STYLE[task.board_column].header} bg-black/5`}
                  >
                    {task.board_column}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {task.priority && (
                    <span
                      className={`${vulfMono.className} text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority as Priority]}`}
                    >
                      {task.priority}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {task.assignee && (
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${avatarColor(task.assignee).bg}`}>
                        <span
                          className={`${vulfMono.className} text-[10px] font-bold ${avatarColor(task.assignee).text}`}
                        >
                          {initials(task.assignee)}
                        </span>
                      </div>
                      <span className="text-sm truncate max-w-[90px]">{task.assignee}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {task.due_date && (
                    <span
                      className={`text-sm ${
                        isOverdue(task.due_date) && task.board_column !== "Done"
                          ? "text-red-600 font-medium"
                          : "text-neutral-600"
                      }`}
                    >
                      {fmtDate(task.due_date)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-neutral-400 text-sm">
                  No tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-[#519A70]/15 text-[#519A70] pl-2.5 pr-1.5 py-0.5">
      <span className={`${vulfMono.className} text-xs font-medium`}>{label}</span>
      <button onClick={onRemove} className="hover:opacity-70">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type Filters = {
  search: string;
  assignee: string;
  priority: string;
};

const EMPTY_FILTERS: Filters = { search: "", assignee: "", priority: "" };

function ProjectsDashboard({ token, currentUser, onSwitchUser }: { token: string; currentUser: string; onSwitchUser: () => void }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detail, setDetail] = useState<TaskRecord | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  async function fetchTasks(): Promise<TaskRecord[]> {
    const res = await fetch("/api/admin/tasks", { headers });
    if (res.ok) {
      const data: TaskRecord[] = await res.json();
      setTasks(data);
      setLoading(false);
      return data;
    }
    setLoading(false);
    return [];
  }

  useEffect(() => {
    (async () => {
      const loaded = await fetchTasks();
      if (localStorage.getItem("migrated_scadden")) return;
      const toMigrate = loaded.filter((t) =>
        t.assignee?.toLowerCase().includes("scadden")
      );
      if (toMigrate.length === 0) {
        localStorage.setItem("migrated_scadden", "1");
        return;
      }
      await Promise.all(
        toMigrate.map((t) =>
          fetch(`/api/admin/tasks/${t.id}`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ assignee: "Pearson Brown", assignee_email: null }),
          })
        )
      );
      localStorage.setItem("migrated_scadden", "1");
      fetchTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaved(task: TaskRecord, isEdit: boolean) {
    setTasks((prev) =>
      isEdit ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task]
    );
    setModal(null);
    setDetail(null);
  }

  async function handleDrop(taskId: string, newCol: Col) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.board_column === newCol) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, board_column: newCol } : t))
    );

    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ board_column: newCol }),
    });

    if (!res.ok) {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, board_column: task.board_column } : t))
      );
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDetail(null);
    setModal(null);

    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: "DELETE",
      headers,
    });

    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  }

  function openEdit(task: TaskRecord) {
    setDetail(null);
    setModal({ mode: "edit", task });
  }

  const assigneeOptions = Array.from(
    new Set(tasks.map((t) => t.assignee).filter(Boolean) as string[])
  ).sort();

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filteredTasks = tasks.filter((t) => {
    if (filters.search && !t.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.assignee && t.assignee !== filters.assignee) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    return true;
  });

  function setFilter(key: keyof Filters, val: string) {
    setFilters((f) => ({ ...f, [key]: val }));
  }

  return (
    <section className="container-px py-10 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <a
          href="/admin"
          className="text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </a>
        <div className="flex-1">
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Projects</h1>
        </div>
        <button
          onClick={onSwitchUser}
          className="flex items-center gap-2 rounded-xl border border-black/15 px-3 py-2 hover:bg-neutral-50 transition-colors"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${avatarColor(currentUser).bg}`}>
            <span className={`${vulfMono.className} text-[10px] font-bold ${avatarColor(currentUser).text}`}>
              {initials(currentUser)}
            </span>
          </div>
          <span className="text-sm hidden sm:inline">{currentUser}</span>
        </button>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-black/15 overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`p-2 transition-colors ${view === "kanban" ? "bg-black text-white" : "hover:bg-neutral-100"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 transition-colors ${view === "list" ? "bg-black text-white" : "hover:bg-neutral-100"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={`relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
              filtersOpen || activeFilterCount > 0
                ? "border-[#519A70] bg-[#519A70]/10 text-[#519A70]"
                : "border-black/15 hover:bg-neutral-100"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className={`${vulfMono.className} text-xs font-bold`}>{activeFilterCount}</span>
            )}
          </button>
          {/* New task */}
          <button
            onClick={() => setModal({ mode: "create", column: "To do" })}
            className={`${vulfMono.className} flex items-center gap-2 rounded-xl bg-[#519A70] px-4 py-2 text-xs tracking-wide text-white hover:opacity-90`}
          >
            <Plus className="w-4 h-4" />
            NEW TASK
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 mb-6 overflow-x-auto pb-1">
        {COLUMNS.map((col) => {
          const count = tasks.filter((t) => t.board_column === col).length;
          const style = COL_STYLE[col];
          return (
            <div
              key={col}
              className="flex items-center gap-2 rounded-xl bg-white border border-black/10 px-4 py-2.5 shrink-0"
            >
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              <span className={`${vulfMono.className} text-xs font-medium ${style.header}`}>
                {col}
              </span>
              <span className={`${vulfMono.className} text-xs text-neutral-400`}>{count}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 rounded-xl bg-white border border-black/10 px-4 py-2.5 shrink-0">
          <span className={`${vulfMono.className} text-xs font-medium text-neutral-600`}>
            Total
          </span>
          <span className={`${vulfMono.className} text-xs text-neutral-400`}>{tasks.length}</span>
        </div>
      </div>

      {/* Filter bar */}
      {filtersOpen && (
        <div className="mb-5 rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <input
                className="rounded-lg border border-black/20 bg-neutral-50 pl-8 pr-3 py-2 text-sm outline-none focus:border-black/40 w-full"
                placeholder="Search tasks…"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
              />
            </div>

            {/* Assignee */}
            <div className="min-w-[150px]">
              <label className={`${vulfMono.className} block text-xs text-neutral-400 mb-1`}>ASSIGNEE</label>
              <select
                className="rounded-lg border border-black/20 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-black/40 w-full"
                value={filters.assignee}
                onChange={(e) => setFilter("assignee", e.target.value)}
              >
                <option value="">All</option>
                {assigneeOptions.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="min-w-[130px]">
              <label className={`${vulfMono.className} block text-xs text-neutral-400 mb-1`}>PRIORITY</label>
              <select
                className="rounded-lg border border-black/20 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-black/40 w-full"
                value={filters.priority}
                onChange={(e) => setFilter("priority", e.target.value)}
              >
                <option value="">All</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className={`${vulfMono.className} text-xs text-neutral-400 hover:text-neutral-700 underline underline-offset-2 pb-2`}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/8">
              {filters.search && (
                <Chip label={`"${filters.search}"`} onRemove={() => setFilter("search", "")} />
              )}
              {filters.assignee && (
                <Chip label={filters.assignee} onRemove={() => setFilter("assignee", "")} />
              )}
              {filters.priority && (
                <Chip label={filters.priority} onRemove={() => setFilter("priority", "")} />
              )}
              <span className={`${vulfMono.className} text-xs text-neutral-400 self-center`}>
                {filteredTasks.length} of {tasks.length} tasks
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-neutral-400 text-sm">Loading tasks…</div>
      ) : view === "kanban" ? (
        <KanbanView
          tasks={filteredTasks}
          onCardClick={setDetail}
          onAddTask={(col) => setModal({ mode: "create", column: col })}
          onDrop={handleDrop}
        />
      ) : (
        <ListView tasks={filteredTasks} onRowClick={setDetail} />
      )}

      {/* Modals */}
      {modal && (
        <TaskModal
          modal={modal}
          token={token}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {detail && (
        <DetailPanel
          task={detail}
          token={token}
          currentUser={currentUser}
          onClose={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onDelete={() => handleDelete(detail.id)}
          onTaskUpdate={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setDetail(updated);
          }}
        />
      )}
    </section>
  );
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export default function AdminProjectsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (!saved) {
      router.replace("/admin");
      return;
    }
    setToken(saved);
    const user = sessionStorage.getItem("projectsUser");
    if (user) setCurrentUser(user);
  }, [router]);

  function handleSelectUser(name: string) {
    sessionStorage.setItem("projectsUser", name);
    setCurrentUser(name);
  }

  function handleSwitchUser() {
    sessionStorage.removeItem("projectsUser");
    setCurrentUser(null);
  }

  if (!token) return null;
  if (!currentUser) return <UserSelect onSelect={handleSelectUser} />;

  return <ProjectsDashboard token={token} currentUser={currentUser} onSwitchUser={handleSwitchUser} />;
}
