"use client";

import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import Container from "@/components/ui/Container";
import { Flame, Percent, Wallet, X } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: MembershipPlan, firstName: string, lastName: string) {
    setError(null);
    setSubmitting(true);

    const valueCents = interval === "monthly" ? plan.price_monthly_cents : plan.price_annual_cents;
    trackInitiateCheckout({ planKey: plan.key, interval, valueCents });

    try {
      const res = await fetch("/api/memberships/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key, interval, firstName, lastName }),
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

        {error && (
          <p className={`${vulfMono.className} text-center text-sm text-red-600 mb-4`}>{error}</p>
        )}

        <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {plans.map((plan) => (
            <TierCard
              key={plan.key}
              plan={plan}
              interval={interval}
              onCheckout={() => setPendingPlan(plan)}
            />
          ))}
        </div>
      </Container>

      {pendingPlan && (
        <NameModal
          plan={pendingPlan}
          submitting={submitting}
          onCancel={() => setPendingPlan(null)}
          onSubmit={(firstName, lastName) => startCheckout(pendingPlan, firstName, lastName)}
        />
      )}
    </section>
  );
}

function NameModal({
  plan,
  submitting,
  onCancel,
  onSubmit,
}: {
  plan: MembershipPlan;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (firstName: string, lastName: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    onSubmit(firstName.trim(), lastName.trim());
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onCancel()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="eyebrow text-brand">Join {plan.name}</p>
            <h2 className="h3 font-bold">What&apos;s your name?</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">First name</label>
            <input
              className={inputCls}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
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
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
          >
            {submitting ? "Starting checkout…" : "Continue to payment"}
          </button>
        </form>
      </div>
    </div>
  );
}

function TierCard({
  plan,
  interval,
  onCheckout,
}: {
  plan: MembershipPlan;
  interval: BillingInterval;
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
        disabled={!canCheckout}
        className="mt-6 w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
      >
        {!canCheckout ? "Coming soon" : `Join ${plan.name}`}
      </button>
    </div>
  );
}
