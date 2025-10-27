import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { defaultMetadata } from '@/lib/seo';
import { vulfSans, vulfMono } from './fonts';
import MobileStickyCTA from '@/components/MobileStickyCTA';

export const metadata: Metadata = defaultMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${vulfSans.variable} ${vulfMono.variable}`}>
        <Header />
        <main className="pb-24 md:pb-0">{children}</main>
        <MobileStickyCTA />
        <Footer />
      </body>
    </html>
  );
}
