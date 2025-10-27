'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileStickyCTA() {
  const pathname = usePathname();
  if (pathname === '/book') return null;

  return (
    // No background box; just a floating pill
    <div
      className="md:hidden fixed inset-x-0 z-[60] pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0) + 16px)' }} // 16px = bottom gap
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
