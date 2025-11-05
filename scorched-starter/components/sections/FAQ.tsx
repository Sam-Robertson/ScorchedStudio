"use client";

import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

const FAQS = [
  { q: "How do I book if I have the GetOutPass?", a: "At checkout, enter the code “GetOutPass” to reserve your session online. When you arrive, our team will help you redeem your pass in the studio." },
  { q: "Do you take walk-ins?", a: "Yes! Walk-ins are welcome when seats are available, but booking ahead is the best way to secure your spot." },
  { q: "If I want to stay longer than my 90-minute appointment, can I?", a: "If there’s space available, absolutely! You’re welcome to stay and burn to your heart’s content." },
  { q: "Are there age limits?", a: "Most ages are welcome. Guests under 12 will need a guardian present, and younger kids may need a little extra help." },
  { q: "Can I bring my own wood projects?", a: "Yes! If you bring your own wood project, you’ll just pay the standard Studio Entry fee at checkout." },
  { q: "How do I add multiple people to my reservation?", a: "On the booking page, you’ll see a box where you can enter the total number of people in your group." },
];

export default function FAQSection() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <h2 className="h2 text-center font-bold">FAQ’s</h2>
        <p className={`${vulfMono.className} mt-2 text-center text-[16px]`}>Lets clear the smoke</p>

        <div className="mx-auto mt-8 max-w-4xl space-y-4">
          {FAQS.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-black/15 bg-white shadow-sm transition-all
                         open:border-green-500"
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-4
                           px-5 py-4 md:px-6 md:py-5"
              >
                <span className="font-semibold leading-snug transition-colors group-open:text-green-800">
                  {item.q}
                </span>

                {/* Chevron */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 transition-transform duration-200
                             group-open:rotate-180 group-open:text-green-700"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>

              {/* Answer stays neutral */}
              <div className="px-5 pb-5 pt-0 md:px-6 text-neutral-700 font-display">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
