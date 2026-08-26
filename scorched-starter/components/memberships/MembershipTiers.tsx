"use client";

import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import Container from "@/components/ui/Container";
import { Flame, Percent, Wallet } from "lucide-react";
import type { BillingInterval, MembershipPlan } from "@/lib/memberships";
import { trackInitiateCheckout } from "@/lib/fbq";

const inputCls =
  "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MembershipTiers({ plans }: { plans: MembershipPlan[] }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [pendingPlan, setPendingPlan] = useState<MembershipPlan | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPlan(plan: MembershipPlan) {
    setError(null);
    setPendingPlan(plan);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPlan) return;
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const valueCents =
      interval === "monthly" ? pendingPlan.price_monthly_cents : pendingPlan.price_annual_cents;
    trackInitiateCheckout({ planKey: pendingPlan.key, interval, valueCents });

    try {
      const res = await fetch("/api/memberships/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: pendingPlan.key,
          interval,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong starting checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong starting checkout. Please try again.");
      setSubmitting(false);
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

        <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {plans.map((plan) => (
            <TierCard
              key={plan.key}
              plan={plan}
              interval={interval}
              active={pendingPlan?.key === plan.key}
              onCheckout={() => selectPlan(plan)}
            />
          ))}
        </div>

        {pendingPlan && (
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-4xl mt-8 rounded-2xl border border-black/10 bg-white p-6 space-y-4"
          >
            <h3 className="font-semibold text-neutral-900">Join {pendingPlan.name}</h3>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First name</label>
                <input
                  className={inputCls}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last name</label>
                <input
                  className={inputCls}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
            >
              {submitting ? "Starting checkout…" : "Continue to payment"}
            </button>
          </form>
        )}
      </Container>
    </section>
  );
}

function TierCard({
  plan,
  interval,
  active,
  onCheckout,
}: {
  plan: MembershipPlan;
  interval: BillingInterval;
  active: boolean;
  onCheckout: () => void;
}) {
  const monthlyEquivalentCents =
    interval === "monthly" ? plan.price_monthly_cents : Math.round(plan.price_annual_cents / 12);
  const canCheckout =
    interval === "monthly" ? !!plan.stripe_price_monthly : !!plan.stripe_price_annual;

  return (
    <div
      className={`rounded-3xl border bg-white p-6 shadow-sm flex flex-col ${
        active ? "border-brand ring-1 ring-brand" : "border-green"
      }`}
    >
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
        disabled={!canCheckout}
        className="mt-6 w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
      >
        {!canCheckout ? "Coming soon" : `Join ${plan.name}`}
      </button>
    </div>
  );
}
