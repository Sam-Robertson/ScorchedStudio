"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { User } from "lucide-react";

import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

// Every main link goes straight to a page. Secondary destinations (Gift
// Cards, Scorched VIP) live in the footer nav instead of a dropdown.
const MAIN_LINKS = [
  { href: "/locations", label: "Locations" },
  { href: "/memberships", label: "Memberships" },
  { href: "/group-events", label: "Group Events" },
  { href: "/courses", label: "Courses" },
  { href: "/print-design", label: "Print Design" },
  { href: "/waiver", label: "Waiver" },
];

const linkCls =
  "whitespace-nowrap text-[15px] leading-[1.1] [word-spacing:-4px] transition-opacity hover:opacity-80";

const bookNowCls =
  "inline-flex items-center justify-center rounded-md h-9 text-[13px] font-semibold shrink-0 tracking-[0.18em] bg-green text-white hover:opacity-90 transition-opacity";

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const me = useCustomerSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Admin has its own sidebar nav and runs as a full-height shell, same
  // reasoning as FooterShell. Its sidebar is positioned from the top of the
  // viewport, so this can't render there without overlapping it.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header
      className={clsx(
        "sticky top-0 z-50 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85 border-b transition-colors",
        scrolled ? "border-black/10" : "border-transparent"
      )}
    >
      <DesktopHeader me={me} />
      <MobileHeader me={me} />
    </header>
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : Boolean(pathname?.startsWith(href)));
}

/* -------------------- ACCOUNT -------------------- */

type MeResponse =
  | { authenticated: false }
  | { authenticated: true; email: string; name: string | null; initials: string };

// Session state is fetched rather than server-rendered on purpose; see the
// comment in app/api/account/me/route.ts. `null` means "not known yet", which
// renders a same-size placeholder so the nav doesn't shift once it resolves.
function useCustomerSession() {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data: MeResponse) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
    // Re-checked on navigation so logging in or out updates the nav without a
    // hard reload. The root layout never remounts on a client-side route change.
  }, [pathname]);

  return me;
}

function avatarSize(compact: boolean) {
  return compact ? "w-8 h-8 text-[11px]" : "w-9 h-9 text-[12px]";
}

// A span, so it can sit inside a link of its own (the mobile menu row) without
// nesting anchors.
function AvatarBadge({ initials, compact = false }: { initials: string; compact?: boolean }) {
  return (
    <span
      className={clsx(
        "shrink-0 flex items-center justify-center rounded-full border-[1.5px] border-[#3A3A3A] text-neutral-900 font-semibold tracking-[0.02em]",
        avatarSize(compact)
      )}
    >
      {initials}
    </span>
  );
}

const menuItemCls = "block w-full text-left px-3 py-2 rounded-md text-[14px] leading-tight hover:bg-black/5";

async function logout(router: ReturnType<typeof useRouter>) {
  await fetch("/api/account/logout", { method: "POST" });
  router.push("/");
  router.refresh();
}

// Signed out the avatar is a plain link to sign in. Signed in it opens a menu.
function AccountAvatar({ me, compact = false }: { me: MeResponse | null; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (me === null) {
    return <div className={clsx("shrink-0 rounded-full", avatarSize(compact))} aria-hidden />;
  }

  if (!me.authenticated) {
    return (
      <Link
        href="/account/login"
        aria-label="Sign in"
        className={clsx(
          "shrink-0 flex items-center justify-center rounded-full border-[1.5px] border-[#3A3A3A] text-neutral-900 hover:opacity-70 transition-opacity",
          avatarSize(compact)
        )}
      >
        <User className="w-4 h-4" />
      </Link>
    );
  }

  async function handleLogout() {
    setOpen(false);
    await logout(router);
  }

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${me.email}`}
        className="block rounded-full hover:opacity-90 transition-opacity"
      >
        <AvatarBadge initials={me.initials} compact={compact} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-[220px] rounded-md border border-black/10 bg-white shadow-lg p-2 z-10"
        >
          <div className="px-3 py-2 border-b border-black/10 mb-1">
            {me.name && <p className="text-[13px] font-semibold text-neutral-900 truncate">{me.name}</p>}
            <p className="text-[11px] text-neutral-500 truncate">{me.email}</p>
          </div>
          <Link href="/account" className={menuItemCls} role="menuitem" onClick={() => setOpen(false)}>
            Account info
          </Link>
          <button onClick={handleLogout} className={menuItemCls} role="menuitem">
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------- DESKTOP -------------------- */

function DesktopHeader({ me }: { me: MeResponse | null }) {
  const isActive = useIsActive();

  return (
    <div className="hidden xl:block">
      {/* Its own tighter padding rather than the page Container: the six mono
          links plus the right cluster need more width than container-px leaves. */}
      <div className="mx-auto max-w-7xl px-6">
        <nav className={clsx("flex items-center gap-6 h-20", vulfMono.className)} aria-label="Primary">
          <Link href="/" className="shrink-0" aria-label="Home">
            <Image
              src="/illustrations/LogoWordmark.svg"
              alt="Scorched Studio"
              width={200}
              height={32}
              priority
              // Nudged up so the wordmark sits optically level with the links.
              className="w-[200px] h-auto -translate-x-[6px] -translate-y-[2px]"
            />
          </Link>

          {/* One tight group beside the logo rather than links spread across
              the viewport. */}
          <div className="flex items-center gap-8">
            {MAIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(linkCls, isActive(l.href) && "underline underline-offset-4")}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <AccountAvatar me={me} />
            <Link href="/book" className={clsx(bookNowCls, "px-4")}>
              BOOK&nbsp;NOW
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

/* -------------------- MOBILE -------------------- */

function MobileHeader({ me }: { me: MeResponse | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="xl:hidden">
      <Container className="h-14 sm:h-16 lg:h-20 flex items-center gap-3">
        <button
          className="-ml-2 inline-flex items-center justify-center rounded-md p-2 hover:bg-black/5"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link href="/" className="flex items-center" aria-label="Home">
          <Image
            src="/illustrations/LogoWordmark.svg"
            alt="Scorched Studio"
            width={220}
            height={35}
            priority
            className="w-[120px] sm:w-[180px] lg:w-[220px] h-auto"
          />
        </Link>

        <Link href="/book" className={clsx(bookNowCls, "ml-auto px-3", vulfMono.className)}>
          BOOK&nbsp;NOW
        </Link>
      </Container>

      <div
        id="mobile-menu"
        className={clsx(
          "overflow-y-auto transition-[max-height] duration-300",
          open ? "max-h-[calc(100dvh-3.5rem)]" : "max-h-0"
        )}
      >
        <div className={clsx("bg-white px-4 py-4 space-y-4", vulfMono.className)}>
          <div className="space-y-3">
            {MAIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "block text-base text-neutral-900",
                  isActive(l.href) && "underline underline-offset-4"
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-black/10">
            {me?.authenticated ? (
              <div className="space-y-3">
                <Link href="/account" className="flex items-center gap-3 text-base text-neutral-900">
                  <AvatarBadge initials={me.initials} compact />
                  Account info
                </Link>
                <button
                  onClick={() => logout(router)}
                  className="block text-base text-neutral-900"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <Link href="/account/login" className="block text-base text-neutral-900">
                Sign In
              </Link>
            )}
          </div>

          {/* Last item in flow, not fixed: the header's backdrop-blur would
              trap a fixed child inside this panel. */}
          <Link href="/book" className={clsx(bookNowCls, "w-full px-5")}>
            BOOK&nbsp;NOW
          </Link>
        </div>
      </div>
    </div>
  );
}
