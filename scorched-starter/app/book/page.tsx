// app/book/page.tsx
export const dynamic = "force-static";

import Script from "next/script";
import Image from "next/image";

export default function BookPage() {
  return (
    <section className="container-px pt-8 pb-20 max-w-5xl mx-auto text-center">
      <h1 className="text-4xl font-bold mb-3">Book a Session</h1>
      <p className="text-neutral-600 font-display">
        Let us know how many people are coming below!
      </p>

      <div className="overflow-hidden flex justify-end pr-[8%] -mb-4 -mt-8">
        <Image
          src="/arrow.png"
          alt=""
          width={150}
          height={225}
          className="rotate-[110deg] opacity-80"
          aria-hidden="true"
        />
      </div>

      <iframe
        src="https://app.acuityscheduling.com/schedule.php?owner=36703748&ref=embedded_csp"
        title="Schedule Appointment"
        width="100%"
        height="800"
        className="rounded-xl border border-black/10"
        frameBorder="0"
        allow="payment"
      />

      {/* Load Acuity’s embed script the Next.js way (no ESLint error) */}
      <Script
        src="https://embed.acuityscheduling.com/js/embed.js"
        strategy="afterInteractive"
      />
    </section>
  );
}
