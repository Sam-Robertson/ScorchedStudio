// components/Header.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

// ===== Desktop links =====
const coreLinks = [
  { href: "/", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/hours", label: "Hours + Pricing" },
];

const moreLinks = [
  { href: "/group-events", label: "Group Events" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
];

// ===== Mobile links (full list in the drawer) =====
const MOBILE_NAV = [
  { href: "/", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/hours", label: "Hours + Pricing" },
  { href: "/group-events", label: "Group Events" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85 border-b border-black/10">
      {/* Desktop / Tablet */}
      <DesktopHeader />

      {/* Mobile */}
      <MobileHeader />
    </header>
  );
}

/* -------------------- DESKTOP / TABLET -------------------- */
function DesktopHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <div className="hidden md:block">
      <Container>
        <nav
          className={clsx(
            "flex h-16 items-center", // single row, tight height
            vulfMono.className
          )}
          aria-label="Primary"
        >
          {/* Left: Logo (keep your larger art) */}
          <Link href="/" className="shrink-0" aria-label="Home">
            <Image
              src="/illustrations/Logo.svg"
              alt="Scorched Studio"
              width={225}
              height={225}
              priority
            />
          </Link>

          {/* Center: links + More */}
          <div className="flex-1 flex justify-center items-center gap-14">
            {coreLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "text-[15px] leading-[1.1] transition-opacity hover:opacity-80",
                  isActive(l.href) && "underline underline-offset-4"
                )}
              >
                {l.label}
              </Link>
            ))}

            <div className="relative" ref={menuRef}>
              <button
                ref={triggerRef}
                onClick={() => setOpen((s) => !s)}
                className="text-[15px] leading-[1.1] transition-opacity hover:opacity-80"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                More
              </button>

              {open && (
                <div
                  role="menu"
                  className="absolute left-1/2 -translate-x-1/2 mt-2 min-w-[220px] rounded-md border border-black/10 bg-white shadow-lg p-2"
                >
                  <ul className="flex flex-col gap-1">
                    {moreLinks.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className={clsx(
                            "block px-3 py-2 rounded-md text-[14px] leading-tight hover:bg-black/5",
                            isActive(l.href) && "underline underline-offset-4"
                          )}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Right: CTA */}
          <div className="shrink-0">
            <Link
              href="/book"
              className="inline-flex items-center justify-center rounded-md px-5 h-9 text-[13px] font-semibold tracking-[0.18em] bg-black text-white hover:opacity-90 transition-opacity"
            >
              BOOK&nbsp;NOW
            </Link>
          </div>
        </nav>
      </Container>
    </div>
  );
}

/* -------------------- MOBILE -------------------- */
/* Restores your previous “good” mobile: hamburger left, logo right, dropdown panel */
function MobileHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // close on route change / ESC / outside click
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div className="md:hidden">
      <Container className="h-14 flex items-center">
        {/* Hamburger (left) */}
        <button
          className="inline-flex items-center justify-center rounded-md p-4 hover:bg-black/5"
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
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo (right) */}
        <Link
          href="/"
          className="ml-auto flex items-center"
          aria-label="Home"
        >
          <Image
            src="/illustrations/Logo.svg"
            alt="SCORCHED"
            width={140}
            height={24}
            priority
          />
        </Link>
      </Container>

      {/* Dropdown panel (animated) */}
      <div
        id="mobile-menu"
        ref={panelRef}
        className={clsx(
          "overflow-hidden transition-[max-height] duration-300",
          open ? "max-h-96" : "max-h-0"
        )}
      >
        <div className={clsx("bg-white px-4 py-3 space-y-3", vulfMono.className)}>
          {MOBILE_NAV.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="block text-base text-neutral-900"
            >
              {i.label}
            </Link>
          ))}
          <Link
            href="/book"
            className="block text-center rounded-lg px-4 py-3 font-semibold tracking-[0.18em] bg-black text-white"
          >
            BOOK&nbsp;NOW
          </Link>
        </div>
      </div>
    </div>
  );
}
