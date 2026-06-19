'use client';

import { usePathname } from 'next/navigation';
import Container from './ui/Container';


export default function Footer(){
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

return (
<footer className="mt-24 border-t">
<Container className="py-10 text-sm text-neutral-600">
<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
<p>© {new Date().getFullYear()} Scorched Studio · 218 E University Pkwy, Orem, UT 84058</p>
<div className="flex items-center gap-4">
  <a href="/privacy" className="underline text-neutral-400 hover:text-neutral-700 text-xs">Privacy Policy</a>
  <a href="/admin" className="underline text-neutral-400 hover:text-neutral-700 text-xs">Admin</a>
</div>
</div>
</Container>
</footer>
);
}