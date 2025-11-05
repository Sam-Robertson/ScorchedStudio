import FAQ, { FAQS } from "@/components/sections/FAQ";

export const metadata = {
  title: "FAQ | Scorched Studio",
  description:
    "Answers to common questions about booking, walk-ins, ages, staying longer, passes, and bringing your own projects.",
};

export default function FAQPage() {
  return (
    <main className="pb-20">
      <FAQ />

      <p className="mt-10 text-center text-sm text-neutral-600">
        Didn’t find what you need?{" "}
        <a href="/contact" className="underline underline-offset-2 hover:opacity-80">
          Contact us
        </a>
        .
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />
    </main>
  );
}
