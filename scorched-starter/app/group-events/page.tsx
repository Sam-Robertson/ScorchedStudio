// app/group-events/page.tsx
import Container from "@/components/ui/Container";
import ContactForm from "@/components/forms/ContactForm";

type PriceTier = { range: string; price: string };

const STANDARD_TIERS: PriceTier[] = [
  { range: "Up to 10 people", price: "$12 / person" },
  { range: "11–14 people",    price: "$11 / person" },
  { range: "15–25 people",    price: "$10 / person" },
  { range: "26–35 people",    price: "$9 / person"  },
  { range: "36–45 people",    price: "$8 / person"  },
  { range: "46+ people",      price: "$7 / person"  },
];

const CHURCH_TIERS: PriceTier[] = [
  { range: "Small group (11–14)",  price: "$7 / person" },
  { range: "Medium group (15–24)", price: "$6 / person" },
  { range: "Large group (24+)",    price: "$5 / person" },
];

export const metadata = {
  title: "Group Events & Pricing | Scorched Studio",
  description:
    "Group pricing for church groups, youth groups, team offsites, birthdays, and more. Contact us to reserve your spot.",
};

export default function GroupEventsPage() {
  return (
    <main className="pb-20">
      <Intro />
      <GroupPricing />
      <ContactBlock />
    </main>
  );
}

/* ------------------ Intro / Event Types ------------------ */
function Intro() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <h1 className="h2 text-center font-bold">Group Events</h1>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature title="Youth & Church Groups">
            Perfect for weeknight activities.
          </Feature>
          <Feature title="Birthdays & Celebrations">
            Bring your crew, make something personal, snap photos, and leave with keepsakes.
          </Feature>
          <Feature title="Teams & Offsites">
            Creative, low-pressure team time. We handle setup and cleanup so you can just build.
          </Feature>
        </div>
      </Container>
    </section>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm text-neutral-700">{children}</p>
    </div>
  );
}


/* ------------------ Pricing (stacked cards) ------------------ */
function GroupPricing() {
    return (
      <section className="py-8 md:py-12">
        <Container>
            <h2 className="h2 text-center font-bold">Group Pricing</h2>

            {/* Two-line description */}
            <p className="mt-2 text-center font-display">
                Pricing scales with group size.
                <br />
                Project selection happens in-studio.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6">
                <div className="mx-auto w-full max-w-2xl">
                    <PricingCard title="Group Pricing" tiers={STANDARD_TIERS} />
                </div>
                <div className="mx-auto w-full max-w-2xl">
                    <PricingCard title="Church Group Pricing" tiers={CHURCH_TIERS} />
                </div>
            </div>
          {/* Notes with cleaner, shorter copy */}
          <ul className="mt-6 space-y-2 text-sm text-neutral-700 max-w-2xl mx-auto list-disc list-inside">
            <li>Drinks are available as an add-on for all groups.</li>
            <li>After-hours events or private studio reservations (closed to the public) include an additional charge.</li>
          </ul>
        </Container>
      </section>
    );
  }
  

function PricingCard({ title, tiers }: { title: string; tiers: PriceTier[] }) {
  return (
    <div className="rounded-3xl border border-green p-6 md:p-8 shadow-sm bg-white">
      <h3 className="h3 text-center font-bold">{title}</h3>
      <div className="mt-6 grid grid-cols-[1fr_auto] gap-y-3 text-lg">
        <div className="font-sans font-bold">Group Size</div>
        <div className="font-sans text-right font-bold">Rate</div>
        {tiers.map((t) => (
          <Row key={`${title}-${t.range}`} left={t.range} right={t.price} />
        ))}
      </div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <>
      <div className="font-display">{left}</div>
      <div className="font-display text-right">{right}</div>
    </>
  );
}

/* ------------------ Contact ------------------ */
function ContactBlock() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <h2 className="h3 text-center font-bold p-3 md:p-5">Ready to plan your group?</h2>
        <p className="mt-2 text-center font-display max-w-2xl mx-auto">
          Send us the basics and we’ll get back to you with availability and next steps.
        </p>
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-black/10 bg-white p-6 md:p-8 shadow-sm">
          <ContactForm />
        </div>
      </Container>
    </section>
  );
}
