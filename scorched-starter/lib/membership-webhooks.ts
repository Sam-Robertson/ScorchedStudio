// lib/membership-webhooks.ts
// Handlers for the membership-related Stripe webhook events. Kept separate from
// the webhook route so that file stays a thin signature-verify-and-dispatch shell,
// mirroring lib/create-booking-from-intent.ts's split for the booking flow.
//
// A note on Stripe SDK shapes (v20): Subscription no longer carries
// current_period_end directly — it lives on each subscription item
// (subscription.items.data[0].current_period_end). Invoice no longer carries a
// top-level `subscription` field — it's at invoice.parent.subscription_details.subscription.
// Every handler here re-retrieves the subscription by id from whatever event it
// gets, rather than trusting the event payload's shape, so a dashboard API version
// change can't silently send nulls into the database.
import Stripe from "stripe";
import type { BillingInterval, MembershipRecord, MembershipStatus, PlanKey } from "@/lib/memberships";
import {
  getMembershipBySubscriptionId,
  getPlanByKey,
  grantMembershipPeriod,
  syncMembershipStatus,
  upsertMembershipShell,
} from "@/lib/memberships";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function mapStripeStatus(status: Stripe.Subscription.Status): MembershipStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    case "incomplete":
      return "incomplete";
  }
}

function periodEndIso(subscription: Stripe.Subscription): string | null {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// Required first_name/last_name custom fields (app/api/memberships/checkout/
// route.ts) collected instead of relying on Checkout's own optional
// billing-name field. Combined into one string since nothing else in the app
// needs the two parts separately.
function nameFromCustomFields(session: Stripe.Checkout.Session): string | null {
  const byKey = Object.fromEntries(
    (session.custom_fields ?? []).map((f) => [f.key, f.type === "text" ? f.text?.value : null])
  );
  const first = byKey.first_name?.trim();
  const last = byKey.last_name?.trim();
  return first || last ? [first, last].filter(Boolean).join(" ") : null;
}

// entrances_per_period and wood_credit_cents are defined per MONTH. Stripe only
// fires one invoice.paid a year for an annual subscription, so there's only one
// moment a year to grant anything — an annual member gets a full year's worth in
// one lump sum (e.g. 24 entrances for Ember) rather than 2 trickling in monthly.
// Confirmed with the studio: this matches how rollover already works for
// monthly members (unused entrances carry forward), just settled once a year
// instead of once a month.
function periodMultiplier(billingInterval: BillingInterval): number {
  return billingInterval === "annual" ? 12 : 1;
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // The booking flow (app/api/bookings/checkout/route.ts) also creates Checkout
  // Sessions, in `mode: "payment"`. Once this webhook route subscribes to
  // checkout.session.completed, it starts receiving those too — ignore anything
  // that isn't a membership subscription checkout.
  if (session.mode !== "subscription") return;

  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) {
    console.error("MEMBERSHIP_WEBHOOK_NO_SUBSCRIPTION", session.id);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const planKey = subscription.metadata.plan_key as PlanKey | undefined;
  const billingInterval = subscription.metadata.billing_interval as BillingInterval | undefined;
  if (!planKey || !billingInterval) {
    console.error("MEMBERSHIP_WEBHOOK_MISSING_METADATA", subscription.id, subscription.metadata);
    return;
  }

  const plan = await getPlanByKey(planKey);
  if (!plan) {
    console.error("MEMBERSHIP_WEBHOOK_UNKNOWN_PLAN", planKey);
    return;
  }

  const email = session.customer_details?.email ?? session.customer_email;
  const customerId = idOf(session.customer);
  if (!email || !customerId) {
    console.error("MEMBERSHIP_WEBHOOK_MISSING_CUSTOMER", session.id);
    return;
  }

  const membership = await upsertMembershipShell({
    email: email.toLowerCase().trim(),
    name: nameFromCustomFields(session) ?? session.customer_details?.name ?? null,
    phone: session.customer_details?.phone ?? null,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    plan_key: planKey,
    billing_interval: billingInterval,
    status: mapStripeStatus(subscription.status),
    current_period_end: periodEndIso(subscription),
  });

  const multiplier = periodMultiplier(billingInterval);
  await grantMembershipPeriod(membership, {
    entrancesDelta: plan.entrances_per_period * multiplier,
    reason: `checkout:${session.id}`,
    woodCreditCents: plan.wood_credit_cents * multiplier,
  });

  // TODO: session.metadata.add_on === "true" means the customer paid the
  // add_on_price_cents line item at checkout. The benefit it should grant isn't
  // defined yet (extra entrance? merch? printing credit?) — once decided, grant
  // it here via its own grantMembershipPeriod-style ledger write (or a new ledger
  // table if the benefit isn't entrance/wood-credit shaped), keyed on
  // `addon:${session.id}` so this stays idempotent too.
}

export async function handleSubscriptionSync(subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncMembershipStatus({
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    current_period_end: periodEndIso(subscription),
  });
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // invoice.paid fires for the first subscription invoice too
  // (billing_reason "subscription_create"), which checkout.session.completed
  // already handles. Only "subscription_cycle" is a renewal.
  if (invoice.billing_reason !== "subscription_cycle") return;

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) {
    console.error("MEMBERSHIP_WEBHOOK_INVOICE_NO_SUBSCRIPTION", invoice.id);
    return;
  }

  const membership: MembershipRecord | null = await getMembershipBySubscriptionId(subscriptionId);
  if (!membership) {
    console.error("MEMBERSHIP_WEBHOOK_RENEWAL_UNKNOWN_MEMBERSHIP", subscriptionId);
    return;
  }

  const plan = await getPlanByKey(membership.plan_key);
  if (!plan) {
    console.error("MEMBERSHIP_WEBHOOK_RENEWAL_UNKNOWN_PLAN", membership.plan_key);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncMembershipStatus({
    stripe_subscription_id: subscriptionId,
    status: mapStripeStatus(subscription.status),
    current_period_end: periodEndIso(subscription),
  });

  const multiplier = periodMultiplier(membership.billing_interval);
  await grantMembershipPeriod(membership, {
    entrancesDelta: plan.entrances_per_period * multiplier,
    reason: `renewal:${invoice.id}`,
    woodCreditCents: plan.wood_credit_cents * multiplier,
  });
}
