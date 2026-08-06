// app/memberships/success/page.tsx
import Stripe from "stripe";
import Link from "next/link";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getPlanByKey } from "@/lib/memberships";
import { formatDenverDate } from "@/lib/timezone";
import PurchasePixel from "@/components/memberships/PurchasePixel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const metadata = {
  title: "Membership Confirmed | Scorched Studio",
};

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) return <ErrorView message="No checkout session found." />;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });
  } catch {
    return <ErrorView message="We couldn't find that checkout session." />;
  }

  if (session.status !== "complete") {
    return (
      <ErrorView message="This checkout hasn't finished yet. If you just paid, refresh in a moment." />
    );
  }

  const planKey = session.metadata?.plan_key;
  const plan = planKey ? await getPlanByKey(planKey) : null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const amountTotal = session.amount_total ?? 0;

  const subscription =
    typeof session.subscription === "object" && session.subscription ? session.subscription : null;
  const periodEndSeconds = subscription?.items.data[0]?.current_period_end;
  const renewalDate = periodEndSeconds
    ? formatDenverDate(new Date(periodEndSeconds * 1000).toISOString())
    : null;

  return (
    <main className="pb-20">
      <PurchasePixel valueCents={amountTotal} contentName={plan?.name ?? planKey ?? "membership"} />
      <section className="pt-12 md:pt-16">
        <Container className="max-w-lg">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#519A70] flex items-center justify-center text-white text-2xl font-bold mb-4">
              ✓
            </div>
            <p className="eyebrow text-brand">You&apos;re all set</p>
            <h1 className="h2 font-bold">Membership Confirmed</h1>
            {email && (
              <p className={`${vulfMono.className} text-neutral-500 text-sm mt-2`}>
                Stripe has sent a payment receipt to {email}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-6 space-y-3">
            <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-2`}>
              Membership details
            </p>
            <div className={`${vulfMono.className} text-sm space-y-3`}>
              {plan && <Row label="Plan" value={plan.name} />}
              <Row label="Total" value={`$${(amountTotal / 100).toFixed(2)}`} />
              {renewalDate && <Row label="Renews" value={renewalDate} />}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-black/10 bg-[#F7F6F3] p-5">
            <p className={`${vulfMono.className} text-sm font-bold mb-1`}>Studio Location</p>
            <p className={`${vulfMono.className} text-sm text-neutral-600`}>
              218 E University Pkwy, Orem, UT 84058
            </p>
            <p className={`${vulfMono.className} text-xs text-neutral-400 mt-3`}>
              Each person needs to sign a waiver before their first visit.{" "}
              <Link href="/waiver" className="underline text-[#884A20]">Sign waiver →</Link>
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 mt-8">
            <Link href="/" className={`${vulfMono.className} text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
              Back to home
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-16 shrink-0">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <main className="pb-20">
      <Container className="max-w-lg py-20 text-center">
        <p className="text-neutral-600 mb-4">{message}</p>
        <Link href="/memberships" className="underline text-[#884A20] text-sm">Back to memberships</Link>
      </Container>
    </main>
  );
}
