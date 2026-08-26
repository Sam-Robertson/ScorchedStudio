'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Instagram } from 'lucide-react';
import Container from './ui/Container';
import { vulfMono } from '@/app/fonts';
import type { LocationRecord } from '@/lib/locations';

const infoLinks = [
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/blog', label: 'Blog' },
  { href: '/careers', label: 'Careers' },
];

const socialLinks = [
  { href: 'https://www.instagram.com/scorched.studio/', label: 'Instagram', Icon: Instagram },
  { href: 'https://www.tiktok.com/@scorchedstudio', label: 'TikTok', Icon: TikTokIcon },
];

const headingCls = `${vulfMono.className} text-xs tracking-[0.15em] uppercase text-white font-semibold mb-3`;
const linkCls = 'block text-sm text-white/70 hover:text-white';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82c-.9-.98-1.4-2.26-1.4-3.6h-3.15v13.4a2.7 2.7 0 1 1-2.7-2.7c.3 0 .58.05.85.13V9.9a5.85 5.85 0 0 0-.85-.06 5.85 5.85 0 1 0 5.85 5.85V9.36a8.98 8.98 0 0 0 5.15 1.62V7.83a5.6 5.6 0 0 1-3.75-2.01Z" />
    </svg>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company }),
      });
      if (!res.ok) throw new Error();
      setStatus('done');
      setEmail('');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return <p className="text-sm text-white/80">You&apos;re on the list — thanks!</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-sm text-white/70">Deals, new products, and studio news — no spam.</p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/30 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white"
        />
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className={`${vulfMono.className} shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold tracking-[0.1em] text-green hover:opacity-90 disabled:opacity-60`}
        >
          {status === 'loading' ? '…' : 'JOIN'}
        </button>
      </div>
      {status === 'error' && <p className="text-xs text-white/70">Something went wrong — try again.</p>}
    </form>
  );
}

export default function FooterShell({ locations }: { locations: LocationRecord[] }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <footer className="mt-24 bg-green text-white">
      <Container className="py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className={headingCls}>Scorched Studio</h3>
            <p className="text-sm text-white/70 max-w-xs">
              A wood-burning studio for anyone — no experience needed. Come make something you&apos;ll actually use.
            </p>
            <div className="flex items-center gap-4 mt-4">
              {socialLinks.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-white/70 hover:text-white"
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className={headingCls}>Information</h3>
            <div className="space-y-2">
              {infoLinks.map((l) => (
                <a key={l.href} href={l.href} className={linkCls}>{l.label}</a>
              ))}
            </div>
          </div>

          <div>
            <h3 className={headingCls}>Studio Locations</h3>
            <div className="space-y-4">
              {locations.map((loc) => (
                <div key={loc.key}>
                  <a href={`/locations/${loc.key}`} className="text-sm text-white font-medium hover:underline underline-offset-2">
                    {loc.name}
                  </a>
                  {loc.is_bookable ? (
                    <>
                      {loc.address && <p className="text-sm text-white/70">{loc.address}</p>}
                      {loc.phone && (
                        <a
                          href={`tel:${loc.phone.replace(/[^\d+]/g, '')}`}
                          className="text-sm text-white/70 hover:text-white underline-offset-2 hover:underline"
                        >
                          {loc.phone}
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-white/50">
                      {loc.opening_estimate ? `Coming ${loc.opening_estimate}` : "Coming soon"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className={headingCls}>You&apos;re Invited</h3>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-sm text-white/70">© {new Date().getFullYear()} Scorched Studio</p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="underline text-white/60 hover:text-white text-xs">Privacy Policy</a>
            <a href="/admin" className="underline text-white/60 hover:text-white text-xs">Admin</a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
