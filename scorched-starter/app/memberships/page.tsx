// app/memberships/page.tsx
import Container from "@/components/ui/Container";
import { getActivePlans } from "@/lib/memberships";
import { getActiveMembershipOffer, summarizeOffer } from "@/lib/membership-offer";
import MembershipTiers from "@/components/memberships/MembershipTiers";
import { vulfMono } from "@/app/fonts";

export const metadata = {
  title: "Memberships | Scorched Studio",
  description:
    "Join Scorched Studio as a member. Monthly entrances, a wood credit, and a discount on everything you burn.",
};

// Always render per-request: plan pricing should reflect current DB state, not a
// stale build-time snapshot, and this keeps `next build` from depending on the
// membership_plans table existing (it's created by a manual SQL migration, not
// run automatically).
export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  const plans = await getActivePlans();
  const offer = summarizeOffer(getActiveMembershipOffer());

  return (
    <main className="pb-8">
      <section className="pt-6 md:pt-8 pb-3 md:pb-4">
        <Container>
          <p className="eyebrow text-center text-brand">Membership</p>
          <h1 className="h2 text-center font-bold mt-2">Come Burn With Us</h1>
          <p className={`${vulfMono.className} text-center mt-3 max-w-xl mx-auto text-[15px] leading-[1.5] text-neutral-600`}>
            Two tiers built around how often you want to be here. Cancel anytime.
          </p>
          {offer && (
            <p
              className={`${vulfMono.className} mx-auto mt-4 w-fit rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-white`}
            >
              {offer.headline}. Applied automatically at checkout.
            </p>
          )}
        </Container>
      </section>

      <MembershipTiers plans={plans} offer={offer} />
    </main>
  );
}
