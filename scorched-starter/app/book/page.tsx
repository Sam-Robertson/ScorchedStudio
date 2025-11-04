// app/book/page.tsx
export const dynamic = "force-static";

import Script from "next/script";

export default function BookPage() {
  return (
    <section className="container-px py-20 max-w-5xl mx-auto text-center">
      <h1 className="text-4xl font-bold mb-3">Book a Session</h1>
      <p className="text-neutral-600 mb-8 font-display">
        Share your group size and when you’d like to visit.
      </p>

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
