import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { defaultMetadata } from '@/lib/seo';
import { vulfSans, vulfMono } from './fonts';
import MobileStickyCTA from '@/components/MobileStickyCTA';
import Script from 'next/script';
import MetaPixel from '@/components/MetaPixel';

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;


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
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-6587WEMW4K"
      />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-6587WEMW4K');
        `}
      </Script>

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

