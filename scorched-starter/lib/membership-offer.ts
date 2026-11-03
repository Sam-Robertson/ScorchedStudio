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

export type MembershipOffer = {
  key: string;
  headline: string;
  firstMonthCents: number;
  // Plans without an entry here are sold at list price during the offer.
  couponByPlan: Partial<Record<PlanKey, string>>;
  startsAt: Date;
  endsAt: Date;
};

// What the client component needs to render the deal. Kept plain so it can
// cross the server/client boundary as a prop.
export type MembershipOfferSummary = Pick<MembershipOffer, "key" | "headline" | "firstMonthCents"> & {
  planKeys: PlanKey[];
};

// November 2026: first month $10 on Ember only ($20 at list, so the coupon
// takes $10 off). Blaze stays at full price.
const FIRST_MONTH_NOVEMBER_2026: MembershipOffer = {
  key: "first-month-10-nov-2026",
  headline: "Ember is $10 for your first month through November 30",
  firstMonthCents: 1000,
  couponByPlan: { ember: "FIRST_MONTH_10_EMBER" },
  startsAt: new Date("2026-11-02T07:00:00Z"), // Nov 2, midnight Mountain
  endsAt: new Date("2026-12-01T06:59:59Z"), // Nov 30, 11:59 PM Mountain
};

const OFFERS: MembershipOffer[] = [FIRST_MONTH_NOVEMBER_2026];

export function getActiveMembershipOffer(now: Date = new Date()): MembershipOffer | null {
  return OFFERS.find((o) => now >= o.startsAt && now <= o.endsAt) ?? null;
}

export function summarizeOffer(offer: MembershipOffer | null): MembershipOfferSummary | null {
  if (!offer) return null;
  const { key, headline, firstMonthCents } = offer;
  return { key, headline, firstMonthCents, planKeys: Object.keys(offer.couponByPlan) as PlanKey[] };
}
