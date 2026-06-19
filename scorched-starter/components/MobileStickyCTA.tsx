'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MobileStickyCTA() {
  const pathname = usePathname();
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    const THRESHOLD = 100;
    function check() {
      const distFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      setNearBottom(distFromBottom < THRESHOLD);
    }
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  if (pathname === '/book' || pathname?.startsWith('/admin')) return null;
  if (nearBottom) return null;

  return (
    <div
      className="md:hidden fixed inset-x-0 z-[60] pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0) + 16px)' }}
    >
      <div className="container-px flex justify-center">
        <Link
          href="/book"
          className="pointer-events-auto btn-display bg-green text-white px-6 py-4 rounded-full font-semibold shadow-lg shadow-black/20"
        >
          Book my spot
        </Link>
      </div>
    </div>
  );
}
