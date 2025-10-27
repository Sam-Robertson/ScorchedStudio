'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Container from '@/components/ui/Container';

const NAV = [
  { href: '/gallery', label: 'Gallery' },
  { href: '/contact', label: 'Contact' },
];

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`text-sm font-sans transition-colors ${
        active ? 'text-black' : 'text-neutral-700 hover:text-black'
      }`}
    >
      {label}
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // close menu on route change / ESC / outside click
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur">
      <Container className="h-14 md:h-16 flex items-center">
        {/* Hamburger (mobile only, left) */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-md p-4 hover:bg-black/5"
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
              strokeWidth={2.5}        // thicker lines (try 2.5–3.5)
              strokeLinecap="round"  // rounded ends look nicer
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo: right on mobile, left on desktop */}
        <Link
          href="/"
          className="
            ml-auto md:ml-3        /* push right on mobile */
            order-3 md:order-1     /* right on mobile, first on desktop */
            flex items-center gap-2
          "
        >
          {/* use your word-mark file; adjust width/height to your art */}
          <Image src="/illustrations/Logo.svg" alt="SCORCHED" width={140} height={24} priority />
        </Link>

        {/* Desktop nav (right) */}
        <nav className="hidden md:flex items-center gap-6 ml-auto">
          {NAV.map((i) => (
            <NavLink key={i.href} {...i} />
          ))}
          <Link
            href="/book"
            className="btn-display bg-green text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90"
          >
            Book Now
          </Link>
        </nav>
      </Container>

      {/* Mobile menu panel (drops down) */}
      <div
        id="mobile-menu"
        ref={panelRef}
        className={`md:hidden overflow-hidden transition-[max-height] duration-300 ${
          open ? 'max-h-96' : 'max-h-0'
        }`}
      >
        <div className="bg-white px-4 py-3 space-y-3">
          {NAV.map((i) => (
            <Link key={i.href} href={i.href} className="block text-base font-sans text-neutral-800">
              {i.label}
            </Link>
          ))}
          <Link
            href="/book"
            className="block text-center btn-display bg-green text-white px-4 py-3 rounded-lg font-semibold"
          >
            Book Now
          </Link>
        </div>
      </div>
    </header>
  );
}
