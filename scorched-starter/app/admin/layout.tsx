"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import { clearAdminToken, getAdminToken, setAdminToken } from "@/lib/adminAuth";
import { AdminSessionProvider, type LocationKey, type Role } from "@/lib/adminSession";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  Boxes,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  KanbanSquare,
  Landmark,
  Megaphone,
  UserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Printer,
  Share2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

// ── Nav config ────────────────────────────────────────────────────────────────

const IN_STUDIO_NAV = [
  { href: "/admin/bookings",    label: "Bookings",     icon: ClipboardList },
  { href: "/admin/waivers",     label: "Waivers",      icon: FileText },
  { href: "/admin/print-queue", label: "Print Queue",  icon: Printer },
  { href: "/admin/requests",    label: "Requests",     icon: AlertTriangle },
  { href: "/admin/memberships", label: "Memberships",  icon: Users },
];

// Grouped so the sidebar stays short. Every group's parent href is a real page,
// so clicking the group name goes somewhere rather than only toggling.
const ADMIN_NAV = [
  { href: "/admin/reporting",  label: "Reporting",  icon: BarChart2, children: [
    { href: "/admin/reporting",             label: "Overview",    icon: LayoutDashboard },
    { href: "/admin/reporting/projections", label: "Projections", icon: TrendingUp },
    { href: "/admin/accounting",            label: "Accounting",  icon: Landmark },
  ] },
  { href: "/admin/customers",  label: "Customers",  icon: UserRound, children: [
    { href: "/admin/customers", label: "Accounts",  icon: UserRound },
    { href: "/admin/marketing", label: "Marketing", icon: Megaphone },
  ] },
  { href: "/admin/locations",  label: "Operations", icon: Clock, children: [
    { href: "/admin/locations", label: "Locations", icon: Clock },
    { href: "/admin/schedule",  label: "Schedule",  icon: CalendarClock },
    { href: "/admin/events",    label: "Events",    icon: CalendarDays },
  ] },
  // Products had no nav entry at all and was reachable only from inside the
  // print queue, which is why it lives here rather than staying hidden.
  { href: "/admin/courses",    label: "Studio",     icon: GraduationCap, children: [
    { href: "/admin/courses",   label: "Courses",   icon: GraduationCap },
    { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    { href: "/admin/products",  label: "Products",  icon: Package },
  ] },
  // Boards was a 77 line hub page whose only job was linking to Projects and
  // Social. They are children here instead, which saves a click on the two
  // largest pages in the admin.
  { href: "/admin/boards",     label: "Team",       icon: KanbanSquare, children: [
    { href: "/admin/projects", label: "Projects", icon: KanbanSquare },
    { href: "/admin/social",   label: "Social",   icon: Share2 },
    { href: "/admin/careers",  label: "Careers",  icon: Briefcase },
  ] },
];

const IN_STUDIO_PATHS = IN_STUDIO_NAV.map((item) => item.href);
const LOCATION_NAME: Record<LocationKey, string> = { orem: "Orem", slc: "Salt Lake City" };

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
    href === "/admin/reporting"
      // Exact match only — "/admin/reporting" is the Overview child of the
      // Reporting group and must not light up on its sibling sub-route
      // (/admin/reporting/projections).
      ? pathname === "/admin/reporting"
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

// ── Nav group ─────────────────────────────────────────────────────────────────
//
// Two shapes from one component. On desktop the children fly out to the right
// of the sidebar on hover or focus; in the mobile drawer they expand inline,
// because a 16rem drawer has nothing to the right of it.
//
// The flyout is position:fixed rather than absolute. The sidebar is
// overflow-hidden and the nav inside it is overflow-y-auto, so an absolutely
// positioned panel would be clipped by both. Fixed escapes them, since nothing
// in the chain creates a containing block, but it means the panel has to be
// placed from a measured rect rather than by CSS.

function NavGroup({
  href,
  label,
  icon: Icon,
  children,
  pathname,
  onClick,
  flyout,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  children: { href: string; label: string; icon: React.ElementType }[];
  pathname: string | null;
  onClick?: () => void;
  flyout?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Leaving the trigger on the way to the panel would otherwise close it before
  // the pointer arrives.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChildRoute = children.some((c) => pathname?.startsWith(c.href));
  const isActiveGroup = pathname?.startsWith(href) || onChildRoute;

  function place() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.right + 8 });
  }

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }

  function hideSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    // The nav scrolls, so a panel pinned to a stale rect would detach from its
    // trigger. Closing is less jarring than chasing it.
    window.addEventListener("scroll", close, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const parentRow = (
    <div className="flex items-center gap-1" ref={rowRef}>
      <Link
        href={href}
        onClick={onClick}
        className={clsx(
          vulfMono.className,
          "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors",
          isActiveGroup && !onChildRoute
            ? "bg-[#884A20] text-white font-semibold"
            : onChildRoute
              ? "text-neutral-900 font-semibold bg-black/5"
              : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {label}
      </Link>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={open}
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        className="p-2 rounded-lg text-neutral-400 hover:bg-black/5 hover:text-neutral-700 transition-colors"
      >
        {flyout ? (
          <ChevronRight className={clsx("w-3.5 h-3.5 transition-transform", open && "rotate-90")} />
        ) : (
          <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
        )}
      </button>
    </div>
  );

  // Mobile drawer: expand in place, and stay open while the route is inside the
  // group so the current page is visible without reopening it.
  if (!flyout) {
    const expanded = open || isActiveGroup;
    return (
      <div>
        {parentRow}
        {expanded && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-black/8 pl-2">
            {children.map((child) => (
              <NavItem key={child.href} {...child} pathname={pathname} onClick={onClick} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}>
      {parentRow}
      {open && pos && (
        <div
          role="menu"
          aria-label={label}
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-40 min-w-[11rem] rounded-xl border border-black/10 bg-white p-1.5 shadow-xl"
        >
          <p
            className={clsx(
              vulfMono.className,
              "px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-widest text-neutral-400"
            )}
          >
            {label}
          </p>
          <div className="space-y-0.5">
            {children.map((child) => (
              <NavItem
                key={child.href}
                {...child}
                pathname={pathname}
                onClick={() => {
                  setOpen(false);
                  onClick?.();
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar content (shared between desktop and mobile drawer) ────────────────

function SidebarContent({
  pathname,
  role,
  location,
  onLogout,
  onNavClick,
  flyout,
}: {
  pathname: string | null;
  role: Role;
  location: LocationKey | null;
  onLogout: () => void;
  onNavClick?: () => void;
  // True for the fixed desktop sidebar, false for the mobile drawer.
  flyout?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-6 pb-4 border-b border-black/8">
        <p className={clsx(vulfMono.className, "text-sm font-bold text-[#884A20] tracking-wide")}>
          Scorched Studio
        </p>
        <p className={clsx(vulfMono.className, "text-[10px] uppercase tracking-widest text-neutral-400 mt-0.5")}>
          {location ? LOCATION_NAME[location] : "Admin"}
        </p>
        <Link
          href="/"
          onClick={onNavClick}
          className={clsx(
            vulfMono.className,
            "mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-400 hover:text-[#884A20] transition-colors"
          )}
        >
          <ArrowLeft className="w-3 h-3" />
          Back to site
        </Link>
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

        {role === "admin" && (
          <>
            <div className="border-t border-black/8 mb-4" />

            <p className={clsx(vulfMono.className, "text-[9px] uppercase tracking-widest text-neutral-400 px-3 mb-1")}>
              Admin
            </p>
            <div className="space-y-0.5">
              {ADMIN_NAV.map((item) =>
                item.children ? (
                  <NavGroup key={item.href} {...item} pathname={pathname} onClick={onNavClick} flyout={flyout} />
                ) : (
                  <NavItem key={item.href} {...item} pathname={pathname} onClick={onNavClick} />
                )
              )}
            </div>
          </>
        )}
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
  role,
  location,
  onLogout,
}: {
  children: React.ReactNode;
  role: Role;
  location: LocationKey | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Nav hides Admin-tier links for location accounts, but that's cosmetic —
  // this catches direct navigation to an Admin-only URL. The real boundary
  // is server-side (requireAdmin() in each API route); this is just so a
  // location account doesn't land on a broken/empty admin-only page.
  useEffect(() => {
    if (role === "location" && pathname && !IN_STUDIO_PATHS.some((p) => pathname.startsWith(p))) {
      router.replace("/admin/bookings");
    }
  }, [role, pathname, router]);

  return (
    <>
      {/* ── Desktop sidebar — full height: the public header hides on /admin,
          so there's no offset to leave room for. */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 bg-white border-r border-black/10 z-30 overflow-hidden">
        <SidebarContent pathname={pathname} role={role} location={location} onLogout={onLogout} flyout />
      </aside>

      {/* ── Mobile top bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-black/10 bg-white sticky top-0 z-20">
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
                role={role}
                location={location}
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
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("admin");
  const [location, setLocation] = useState<LocationKey | null>(null);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { setInitialized(true); return; }
    // Validate against the server rather than trusting that a token is
    // present — a token signed with a rotated secret, or one that's simply
    // expired, must not render the shell only to 401 on every API call.
    fetch("/api/admin/session", { headers: { Authorization: `Bearer ${saved}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => {
        if (session) {
          setToken(saved);
          setRole(session.role);
          setLocation(session.location);
          setAuthed(true);
        } else {
          clearAdminToken();
        }
      })
      .catch(() => clearAdminToken())
      .finally(() => setInitialized(true));
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
    const session = await res.json();
    setAdminToken(session.token, remember);
    setToken(session.token);
    setRole(session.role);
    setLocation(session.location);
    setAuthed(true);
    setAuthLoading(false);
  }

  function handleLogout() {
    clearAdminToken();
    setAuthed(false);
    setToken(null);
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
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-black/20"
            />
            Remember this device
          </label>
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

  return (
    <AdminSessionProvider value={{ token: token!, role, location }}>
      <AdminShell role={role} location={location} onLogout={handleLogout}>
        {children}
      </AdminShell>
    </AdminSessionProvider>
  );
}
