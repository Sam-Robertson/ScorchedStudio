"use client";

import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import Container from "@/components/ui/Container";
import { Flame, Percent, Wallet } from "lucide-react";
import type { BillingInterval, MembershipPlan } from "@/lib/memberships";
import { trackInitiateCheckout } from "@/lib/fbq";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MembershipTiers({ plans }: { plans: MembershipPlan[] }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: MembershipPlan) {
    setError(null);
    setLoadingKey(plan.key);

    const valueCents = interval === "monthly" ? plan.price_monthly_cents : plan.price_annual_cents;
    trackInitiateCheckout({ planKey: plan.key, interval, valueCents });

    try {
      const res = await fetch("/api/memberships/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong starting checkout. Please try again.");
        setLoadingKey(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong starting checkout. Please try again.");
      setLoadingKey(null);
    }
  }

  return (
    <section className="py-6 md:py-8">
      <Container>
        <div className="flex justify-center mb-8">
          <div className="flex rounded-lg border border-black/15 overflow-hidden">
            {(["monthly", "annual"] as BillingInterval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`${vulfMono.className} px-5 py-2 text-sm capitalize transition-colors ${
                  interval === i ? "bg-brand text-white" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className={`${vulfMono.className} text-center text-sm text-red-600 mb-4`}>{error}</p>
        )}

        <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {plans.map((plan) => (
            <TierCard
              key={plan.key}
              plan={plan}
              interval={interval}
              loading={loadingKey === plan.key}
              onCheckout={() => startCheckout(plan)}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

function TierCard({
  plan,
  interval,
  loading,
  onCheckout,
}: {
  plan: MembershipPlan;
  interval: BillingInterval;
  loading: boolean;
  onCheckout: () => void;
}) {
  const monthlyEquivalentCents =
    interval === "monthly" ? plan.price_monthly_cents : Math.round(plan.price_annual_cents / 12);
  const canCheckout =
    interval === "monthly" ? !!plan.stripe_price_monthly : !!plan.stripe_price_annual;

  return (
    <div className="rounded-3xl border border-green bg-white p-6 shadow-sm flex flex-col">
      <h2 className="h3 font-bold">{plan.name}</h2>
      {/* min-h reserves room for the longer of the two taglines (4 lines at
          14px/1.5 leading) so the price row below lines up across cards
          regardless of how many lines a given tagline wraps to. */}
      <p className={`${vulfMono.className} mt-2 min-h-[84px] text-[14px] leading-[1.5] text-neutral-700`}>
        {plan.tagline}
      </p>

      <div className="mt-5">
        <span className="text-3xl font-bold">{formatCents(monthlyEquivalentCents)}</span>
        <span className={`${vulfMono.className} text-sm text-neutral-500`}>/mo</span>
        {interval === "annual" && (
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
            {formatCents(plan.price_annual_cents)} billed annually
          </p>
        )}
      </div>

      <ul className={`${vulfMono.className} mt-5 space-y-3 text-sm text-neutral-700 flex-1`}>
        <li className="flex items-start gap-2">
          <Flame className="w-4 h-4 mt-0.5 text-brand shrink-0" />
          {plan.entrances_per_period} entrances every month, rolls over if unused
        </li>
        {plan.wood_credit_cents > 0 && (
          <li className="flex items-start gap-2">
            <Wallet className="w-4 h-4 mt-0.5 text-brand shrink-0" />
            {formatCents(plan.wood_credit_cents)} wood credit every month
          </li>
        )}
        {plan.wood_discount_pct > 0 && (
          <li className="flex items-start gap-2">
            <Percent className="w-4 h-4 mt-0.5 text-brand shrink-0" />
            {plan.wood_discount_pct}% off wood and projects
          </li>
        )}
      </ul>

      <button
        onClick={onCheckout}
        disabled={loading || !canCheckout}
        className="mt-6 w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
      >
        {!canCheckout ? "Coming soon" : loading ? "Starting checkout..." : `Join ${plan.name}`}
      </button>
    </div>
  );
}
