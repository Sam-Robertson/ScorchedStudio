"use client";

// Admin search palette. Opens from the sidebar button, the mobile top bar, or
// Cmd/Ctrl+K anywhere in the admin. Finds two kinds of thing:
//   - pages, matched locally against the nav the caller passes in (already
//     filtered to what this role can open), and
//   - records (bookings, waivers, memberships, accounts) from
//     /api/admin/search, which link to the matching page pre-filtered.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CornerDownLeft, ExternalLink, Loader2, Search, X } from "lucide-react";
import { vulfMono } from "@/app/fonts";
import { useAdminSession } from "@/lib/adminSession";
import type { SearchGroup } from "@/app/api/admin/search/route";

export type SearchablePage = {
  href: string;
  label: string;
  // Group name shown beside it, e.g. "Studio" for Courses.
  section?: string;
  icon: React.ElementType;
  external?: boolean;
};

type Row =
  | { kind: "page"; key: string; page: SearchablePage }
  | { kind: "record"; key: string; group: string; title: string; subtitle: string; href: string };

const DEBOUNCE_MS = 200;
const MAX_PAGES = 6;

export function useAdminSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export function AdminSearchButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        vulfMono.className,
        "flex w-full items-center gap-2 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-400 hover:border-black/20 hover:text-neutral-700 transition-colors",
        className,
      )}
    >
      <Search className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="hidden md:inline rounded border border-black/10 bg-white px-1.5 text-[10px] text-neutral-400">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

export default function AdminSearch({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: SearchablePage[];
}) {
  const router = useRouter();
  const { token } = useAdminSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);

  // Fresh box each time it opens.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setGroups([]);
    setError(false);
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Debounced record search. The AbortController drops a slow earlier response
  // so it can never overwrite the results for what is typed now.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      setError(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: { groups: SearchGroup[] }) => {
          setGroups(data.groups);
          setError(false);
          setLoading(false);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setGroups([]);
          setError(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, open, token]);

  const pageRows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const matches = term
      ? pages.filter(
          (p) => p.label.toLowerCase().includes(term) || p.section?.toLowerCase().includes(term),
        )
      : pages;
    // With nothing typed, the list doubles as a quick jump menu.
    return matches
      .slice(0, term ? MAX_PAGES : pages.length)
      .map((p) => ({ kind: "page" as const, key: `page:${p.href}`, page: p }));
  }, [q, pages]);

  const recordRows = useMemo<Row[]>(
    () =>
      groups.flatMap((g) =>
        g.hits.map((h) => ({
          kind: "record" as const,
          key: `${g.key}:${h.id}`,
          group: g.label,
          title: h.title,
          subtitle: h.subtitle,
          href: h.href,
        })),
      ),
    [groups],
  );

  // People first once anything matches: that is what a typed name is usually after.
  const rows = useMemo(() => [...recordRows, ...pageRows], [recordRows, pageRows]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (row: Row) => {
      onClose();
      if (row.kind === "page" && row.page.external) {
        window.open(row.page.href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(row.kind === "page" ? row.page.href : row.href);
    },
    [onClose, router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) go(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!open) return null;

  const term = q.trim();
  const searchedRecords = term.length >= 2;
  let lastHeading = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search admin"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-black/10 px-4">
          <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search people, emails, or pages"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-neutral-400"
            aria-label="Search"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:bg-black/5 hover:text-neutral-700"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {rows.map((row, i) => {
            const heading = row.kind === "page" ? (term ? "Pages" : "Jump to") : row.group;
            const showHeading = heading !== lastHeading;
            lastHeading = heading;
            const isActive = i === active;
            return (
              <div key={row.key}>
                {showHeading && (
                  <p
                    className={clsx(
                      vulfMono.className,
                      "px-2 pb-1 pt-2 text-[10px] uppercase tracking-widest text-neutral-400",
                    )}
                  >
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(row)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    isActive ? "bg-[#884A20]/10" : "hover:bg-black/5",
                  )}
                >
                  {row.kind === "page" ? (
                    <>
                      <row.page.icon className="w-4 h-4 flex-shrink-0 text-neutral-400" />
                      <span className="flex-1 text-sm text-neutral-800">{row.page.label}</span>
                      {row.page.section && (
                        <span className="text-xs text-neutral-400">{row.page.section}</span>
                      )}
                      {row.page.external && <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />}
                    </>
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-800">{row.title}</span>
                      <span className="block truncate text-xs text-neutral-400">{row.subtitle}</span>
                    </span>
                  )}
                  {isActive && <CornerDownLeft className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" />}
                </button>
              </div>
            );
          })}

          {rows.length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">
              {error ? "Search failed. Try again." : `Nothing matches "${term}".`}
            </p>
          )}
          {searchedRecords && !loading && !error && recordRows.length === 0 && rows.length > 0 && (
            <p className="px-3 pb-2 pt-3 text-xs text-neutral-400">{`No people match "${term}".`}</p>
          )}
        </div>
      </div>
    </div>
  );
}
