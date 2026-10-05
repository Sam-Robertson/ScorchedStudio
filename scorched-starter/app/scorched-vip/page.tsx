// app/scorched-vip/page.tsx
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { MessageSquare, Tag, Star } from "lucide-react";
import VipSignupForm from "@/components/marketing/VipSignupForm";

export const metadata = {
  title: "Scorched VIP | Scorched Studio",
  description:
    "Join Scorched VIP, our free loyalty program. Get early access to new products, exclusive deals, and a free wooden ring when you sign up.",
};

export default function ScorchedVIPPage() {
  return (
    <main className="pb-8">
      <Intro />
      <SignUp />
      <Perks />
    </main>
  );
}

/* ------------------ Intro ------------------ */
function Intro() {
  return (
    <section className="pt-6 md:pt-8 pb-3 md:pb-4">
      <Container>
        <p className="eyebrow text-center text-brand">Free to join</p>
        <h1 className="h2 text-center font-bold mt-2">Scorched VIP</h1>
      </Container>
    </section>
  );
}

/* ------------------ Perks ------------------ */
function Perks() {
  return (
    <section className="py-6 md:py-8">
      <Container>
        <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          <Perk icon={<Star className="w-6 h-6" />} title="Free Wooden Ring">
            Every new VIP member gets a free wooden ring just for joining. Come pick it
            up on your next visit.
          </Perk>
          <Perk icon={<Tag className="w-6 h-6" />} title="Exclusive Deals">
            VIP members get access to discounts and promos that never go public. Save
            more on studio entry and projects.
          </Perk>
          <Perk icon={<MessageSquare className="w-6 h-6" />} title="First to Know">
            Hear about new products, seasonal specials, and studio news before anyone
            else. No spam, just the good stuff.
          </Perk>
        </div>
      </Container>
    </section>
  );
}

function Perk({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white border border-green shadow-sm text-brand mb-3">
        {icon}
      </div>
      <h3 className="h3 font-bold">{title}</h3>
      <p
        className={`${vulfMono.className} mt-2 text-[14px] leading-[1.5] text-neutral-700 max-w-xs`}
      >
        {children}
      </p>
    </div>
  );
}

/* ------------------ Sign Up ------------------ */
function SignUp() {
  return (
    <section className="py-6 md:py-8">
      <Container>
        <div className="mt-2 mx-auto max-w-xl">
          <VipSignupForm />
        </div>
      </Container>
    </section>
  );
}
