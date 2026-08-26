"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import type { LocationRecord } from "@/lib/locations";

const membershipLinks = [
  { href: "/account/login", label: "Sign In" },
  { href: "/memberships", label: "Membership Info" },
];

const moreLinks = [
  { href: "/print-design", label: "Print Design" },
  { href: "/waiver", label: "Waiver" },
  {
    href: "https://app.squareup.com/gift/ML3N1RN3EGATW/order",
    label: "Gift Cards",
  },
  { href: "/scorched-vip", label: "Scorched VIP" },
];

const REST_OF_MOBILE_NAV = [
  { href: "/account/login", label: "Membership Sign In" },
  { href: "/memberships", label: "Memberships" },
  { href: "/group-events", label: "Group Events" },
  { href: "/print-design", label: "Print Design" },
  { href: "/scorched-vip", label: "Scorched VIP" },
  { href: "/waiver", label: "Waiver" },
  {
    href: "https://app.squareup.com/gift/ML3N1RN3EGATW/order",
    label: "Gift Cards",
  },
];

export default function HeaderShell({ locations }: { locations: LocationRecord[] }) {
  const locationLinks = locations.map((loc) => ({ href: `/locations/${loc.key}`, label: loc.name }));

  return (
    <header className="sticky top-0 z-50 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85 border-b border-black/10">
      <DesktopHeader locationLinks={locationLinks} />
      <MobileHeader locationLinks={locationLinks} />
    </header>
  );
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  return { open, setOpen, menuRef, triggerRef };
}

function NavDropdown({
  label,
  links,
  isActive,
}: {
  label: string;
  links: { href: string; label: string }[];
  isActive: (href: string) => boolean;
}) {
  const { open, setOpen, menuRef, triggerRef } = useDropdown();

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1 whitespace-nowrap text-[15px] leading-[1.1] transition-opacity hover:opacity-80"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 mt-2 min-w-[220px] rounded-md border border-black/10 bg-white shadow-lg p-2"
        >
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                {l.href.startsWith("http") ? (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 rounded-md text-[14px] leading-tight hover:bg-black/5"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </a>
                ) : (
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
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------- DESKTOP -------------------- */
function DesktopHeader({ locationLinks }: { locationLinks: { href: string; label: string }[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <div className="hidden md:block">
      <Container>
        <nav
          className={clsx(
            "flex h-16 items-center",
            vulfMono.className
          )}
          aria-label="Primary"
        >
          {/* Logo */}
          <Link href="/" className="shrink-0" aria-label="Home">
            <Image
              src="/illustrations/Logo.svg"
              alt="Scorched Studio"
              width={225}
              height={225}
              priority
            />
          </Link>

          {/* Center Nav */}
          <div className="flex-1 flex justify-center items-center gap-12">
            <Link
              href="/"
              className={clsx(
                "whitespace-nowrap text-[15px] leading-[1.1] transition-opacity hover:opacity-80",
                isActive("/") && "underline underline-offset-4"
              )}
            >
              Home
            </Link>

            <NavDropdown label="Studio Locations" links={locationLinks} isActive={isActive} />

            <NavDropdown label="Memberships" links={membershipLinks} isActive={isActive} />

            <Link
              href="/group-events"
              className={clsx(
                "whitespace-nowrap text-[15px] leading-[1.1] transition-opacity hover:opacity-80",
                isActive("/group-events") && "underline underline-offset-4"
              )}
            >
              Group Events
            </Link>

            <NavDropdown label="More" links={moreLinks} isActive={isActive} />
          </div>

          {/* CTA */}
          <div className="shrink-0 flex items-center pl-8">
            <Link
              href="/book"
              className="inline-flex items-center justify-center rounded-md px-5 h-9 text-[13px] font-semibold tracking-[0.18em] bg-green text-white hover:opacity-90 transition-opacity"
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
function MobileHeader({ locationLinks }: { locationLinks: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const mobileNav = [
    { href: "/", label: "Home" },
    ...locationLinks,
    ...REST_OF_MOBILE_NAV,
  ];

  return (
    <div className="md:hidden">
      <Container className="h-14 flex items-center">
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
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link href="/" className="ml-auto flex items-center" aria-label="Home">
          <Image
            src="/illustrations/Logo.svg"
            alt="SCORCHED"
            width={140}
            height={24}
            priority
          />
        </Link>
      </Container>

      <div
        id="mobile-menu"
        ref={panelRef}
        className={clsx(
          "overflow-y-auto transition-[max-height] duration-300",
          open ? "max-h-[calc(100dvh-3.5rem)]" : "max-h-0"
        )}
      >
        <div className={clsx("bg-white px-4 py-3 space-y-3", vulfMono.className)}>
          {mobileNav.map((i) =>
            i.href.startsWith("http") ? (
              <a
                key={i.href}
                href={i.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-base text-neutral-900"
              >
                {i.label}
              </a>
            ) : (
              <Link
                key={i.href}
                href={i.href}
                className="block text-base text-neutral-900"
              >
                {i.label}
              </Link>
            )
          )}

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
