import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { defaultMetadata } from '@/lib/seo';
import { vulfSans, vulfMono } from './fonts';
import MobileStickyCTA from '@/components/MobileStickyCTA';
import Script from 'next/script';
import MetaPixel from '@/components/MetaPixel';

// Both analytics tags are gated on their id being present, so a deployment
// without them set loads neither. That keeps preview and local traffic out of
// the real Meta and Google properties, and it means the privacy policy's
// analytics section describes something that is actually switched on.
//
// These are NEXT_PUBLIC_, so they are inlined at build time: setting either one
// in Vercel only takes effect on the next deploy.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;


export const metadata: Metadata = {
  ...defaultMetadata,
  icons: {
    icon: [{ url: '/icon.png' }],
    apple: [{ url: '/apple-touch-icon.png' }],
    shortcut: ['/icon.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Google Analytics */}
      {GA_ID && (
        <>
          <Script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
          <Script id="google-analytics">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}

      {META_PIXEL_ID && <MetaPixel pixelId={META_PIXEL_ID} />}
      <body className={`${vulfSans.variable} ${vulfMono.variable}`}>
        {META_PIXEL_ID && (
          // eslint-disable-next-line @next/next/no-img-element
          <noscript><img height="1" width="1" style={{display:'none'}}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          /></noscript>
        )}
        <Header />
        <main className="pb-24 md:pb-0">{children}</main>
        <MobileStickyCTA />
        <Footer />
      </body>
    </html>
  );
}

