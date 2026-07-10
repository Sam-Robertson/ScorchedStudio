"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import clsx from "clsx";
import {
  BarChart2,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  KanbanSquare,
  LogOut,
  Menu,
  Printer,
  X,
} from "lucide-react";

// ── Nav config ────────────────────────────────────────────────────────────────

const IN_STUDIO_NAV = [
  { href: "/admin/bookings",    label: "Bookings",     icon: ClipboardList },
  { href: "/admin/waivers",     label: "Waivers",      icon: FileText },
  { href: "/admin/print-queue", label: "Print Queue",  icon: Printer },
];

const ADMIN_NAV = [
  { href: "/admin/hours",     label: "Hours",      icon: Clock },
  { href: "/admin/reporting", label: "Reporting",  icon: BarChart2 },
  { href: "/admin/events",    label: "Events",     icon: CalendarDays },
  { href: "/admin/boards",    label: "Boards",     icon: KanbanSquare },
];

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  pathname: string | null;
  onClick?: () => void;
}) {
  const active =
    href === "/admin/boards"
      ? pathname?.startsWith("/admin/boards") ||
        pathname?.startsWith("/admin/projects") ||
        pathname?.startsWith("/admin/social")
      : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={clsx(
        vulfMono.className,
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors",
        active
          ? "bg-[#884A20] text-white font-semibold"
          : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

// ── Sidebar content (shared between desktop and mobile drawer) ────────────────

function SidebarContent({
  pathname,
  onLogout,
  onNavClick,
}: {
  pathname: string | null;
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-6 pb-4 border-b border-black/8">
        <p className={clsx(vulfMono.className, "text-sm font-bold text-[#884A20] tracking-wide")}>
          Scorched Studio
        </p>
        <p className={clsx(vulfMono.className, "text-[10px] uppercase tracking-widest text-neutral-400 mt-0.5")}>
          Admin
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className={clsx(vulfMono.className, "text-[9px] uppercase tracking-widest text-neutral-400 px-3 mb-1")}>
          In Studio
        </p>
        <div className="space-y-0.5 mb-4">
          {IN_STUDIO_NAV.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} onClick={onNavClick} />
          ))}
        </div>

        <div className="border-t border-black/8 mb-4" />

        <p className={clsx(vulfMono.className, "text-[9px] uppercase tracking-widest text-neutral-400 px-3 mb-1")}>
          Admin
        </p>
        <div className="space-y-0.5">
          {ADMIN_NAV.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} onClick={onNavClick} />
          ))}
        </div>
      </nav>

      {/* Log out */}
      <div className="px-3 pt-3 pb-5 border-t border-black/8">
        <button
          onClick={onLogout}
          className={clsx(
            vulfMono.className,
            "flex items-center gap-2 px-3 py-2 w-full rounded-lg text-xs text-neutral-400 hover:text-neutral-700 hover:bg-black/5 transition-colors"
          )}
        >
          <LogOut className="w-3.5 h-3.5" />
          Log out
        </button>
      </div>
    </div>
  );
}

// ── Authenticated shell ────────────────────────────────────────────────────────

function AdminShell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  return (
    <>
      {/* ── Desktop sidebar — fixed below the sticky public header (h-16 = 4rem) */}
      <aside className="hidden md:flex flex-col fixed top-16 left-0 h-[calc(100vh-4rem)] w-56 bg-white border-r border-black/10 z-30 overflow-hidden">
        <SidebarContent pathname={pathname} onLogout={onLogout} />
      </aside>

      {/* ── Mobile top bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-black/10 bg-white sticky top-14 z-20">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 rounded-lg hover:bg-black/5 -ml-1.5"
          aria-label="Open admin menu"
        >
          <Menu className="w-5 h-5 text-neutral-600" />
        </button>
        <p className={clsx(vulfMono.className, "text-[11px] uppercase tracking-widest text-neutral-400 font-semibold")}>
          Admin
        </p>
      </div>

      {/* ── Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <aside className="absolute top-0 left-0 h-full w-64 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-end px-3 py-3 border-b border-black/10">
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-black/5"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent
                pathname={pathname}
                onLogout={onLogout}
                onNavClick={() => setDrawerOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* ── Page content — offset right of sidebar on desktop */}
      <div className="md:ml-56">
        {children}
      </div>
    </>
  );
}

// ── Root admin layout ─────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (saved) setAuthed(true);
    setInitialized(true);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setAuthError("Incorrect password.");
      setAuthLoading(false);
      return;
    }
    const { token } = await res.json();
    sessionStorage.setItem("adminToken", token);
    setAuthed(true);
    setAuthLoading(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("adminToken");
    setAuthed(false);
    setPassword("");
  }

  if (!initialized) return null;

  if (!authed) {
    return (
      <section className="container-px py-20 max-w-sm mx-auto">
        <p className="eyebrow text-brand mb-2">Admin</p>
        <h1 className="h2 font-bold mb-8">Login</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              className={`${inputCls} w-full py-3`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {authError && <p className="text-sm text-red-600 mt-1">{authError}</p>}
          </div>
          <button
            type="submit"
            disabled={authLoading}
            className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-3 text-sm tracking-[0.2em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
          >
            {authLoading ? "Checking…" : "LOG IN"}
          </button>
        </form>
      </section>
    );
  }

  return <AdminShell onLogout={handleLogout}>{children}</AdminShell>;
}
