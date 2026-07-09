// app/group-events/page.tsx
import Container from "@/components/ui/Container";
import ContactForm from "@/components/forms/ContactForm";
import { vulfMono } from "@/app/fonts";
import Image from "next/image";
import GroupPricingSection from "@/components/sections/GroupPricing";

export const metadata = {
  title: "Group Events & Pricing | Scorched Studio",
  description:
    "Group pricing for church groups, youth groups, team offsites, birthdays, and more. Contact us to reserve your spot.",
};

export default function GroupEventsPage() {
  return (
    <main className="pb-20">
      <Intro />
      <GroupPricingSection />
      <ContactBlock />
    </main>
  );
}

/* ------------------ Intro / Event Types ------------------ */
function Intro() {
  return (
    <section className="pt-12 md:pt-16 pb-10 md:pb-14">
      <Container>
        <h1 className="h2 text-center font-bold">Group Events</h1>

        <div className="mt-14 md:mt-16 mx-auto max-w-5xl grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-16">
          <Feature
            title="Youth & Church Groups"
            svg="/illustrations/angel.svg"
            alt="Youth group icon"
          >
            Great for weeknight youth nights, small groups, or church activities.
          </Feature>

          <Feature
            title="Birthdays & Celebrations"
            svg="/illustrations/birthday.svg"
            alt="Birthday icon"
          >
            Bring your crew, make something personal, snap photos, and leave with keepsakes.
          </Feature>

          <Feature
            title="Teams & Offsites"
            svg="/illustrations/group.svg"
            alt="Teams icon"
          >
            Creative, low-pressure team time. We handle setup and cleanup so you can just build.
          </Feature>
        </div>
      </Container>
    </section>
  );
}

function Feature({
  title,
  children,
  svg,
  alt,
}: {
  title: string;
  children: React.ReactNode;
  svg: string;
  alt: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-24 h-24 md:w-28 md:h-28 mb-6">
        <Image src={svg} alt={alt} fill className="object-contain" sizes="112px" />
      </div>

      <h3 className="h3 font-bold">{title}</h3>

      <p
        className={`${vulfMono.className} mt-3 text-[15px] md:text-base leading-[1.6] text-neutral-700 max-w-xs`}
      >
        {children}
      </p>
    </div>
  );
}

/* ------------------ Contact ------------------ */
function ContactBlock() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <h2 className="h2 text-center font-bold p-3 md:p-5">Ready to plan your group?</h2>
        <p className="mt-2 text-center font-display max-w-2xl mx-auto">
          Send us the basics and we will get back to you with availability and next steps.
        </p>
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-black/10 bg-white p-6 md:p-8 shadow-sm">
          <ContactForm />
        </div>
      </Container>
    </section>
  );
}
