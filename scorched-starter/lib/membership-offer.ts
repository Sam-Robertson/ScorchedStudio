// lib/membership-offer.ts
// A time-boxed promo on monthly memberships. While the window is open, the
// checkout route attaches the plan's Stripe coupon automatically, so nobody
// has to type a code and the memberships page can show the deal to everyone
// who lands on it, not just people who clicked an email link.
//
// The coupons (duration "once", so only the first invoice is discounted) were
// created through the Stripe API with a redeem_by matching endsAt, so Stripe
// refuses them after the window even if this file is stale.
import type { PlanKey } from "@/lib/memberships";

export type MembershipOfferPlan = {
  coupon: string;
  firstMonthCents: number;
};

export type MembershipOffer = {
  key: string;
  headline: string;
  // Plans without an entry here are sold at list price during the offer.
  plans: Partial<Record<PlanKey, MembershipOfferPlan>>;
  startsAt: Date;
  endsAt: Date;
};

// What the client component needs to render the deal. Kept plain so it can
// cross the server/client boundary as a prop.
export type MembershipOfferSummary = {
  key: string;
  headline: string;
  firstMonthCentsByPlan: Partial<Record<PlanKey, number>>;
};

// November 2026: first month half price on both monthly plans. Ember lists at
// $20 and Blaze at $60, so the coupons take $10 and $30 off the first invoice.
const FIRST_MONTH_NOVEMBER_2026: MembershipOffer = {
  key: "first-month-half-nov-2026",
  headline: "Half price first month through November 30",
  plans: {
    ember: { coupon: "FIRST_MONTH_10_EMBER", firstMonthCents: 1000 },
    blaze: { coupon: "FIRST_MONTH_30_BLAZE", firstMonthCents: 3000 },
  },
  startsAt: new Date("2026-11-02T07:00:00Z"), // Nov 2, midnight Mountain
  endsAt: new Date("2026-12-01T06:59:59Z"), // Nov 30, 11:59 PM Mountain
};

const OFFERS: MembershipOffer[] = [FIRST_MONTH_NOVEMBER_2026];

export function getActiveMembershipOffer(now: Date = new Date()): MembershipOffer | null {
  return OFFERS.find((o) => now >= o.startsAt && now <= o.endsAt) ?? null;
}

export function summarizeOffer(offer: MembershipOffer | null): MembershipOfferSummary | null {
  if (!offer) return null;
  const firstMonthCentsByPlan: Partial<Record<PlanKey, number>> = {};
  for (const [key, plan] of Object.entries(offer.plans)) {
    firstMonthCentsByPlan[key as PlanKey] = plan.firstMonthCents;
  }
  return { key: offer.key, headline: offer.headline, firstMonthCentsByPlan };
}
