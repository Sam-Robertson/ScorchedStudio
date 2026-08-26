// app/api/memberships/checkout/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getPlanByKey } from "@/lib/memberships";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const schema = z.object({
  planKey: z.enum(["ember", "blaze"]),
  interval: z.enum(["monthly", "annual"]),
  addOn: z.boolean().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { planKey, interval, addOn, firstName, lastName } = parsed.data;

  const plan = await getPlanByKey(planKey);
  if (!plan || !plan.active) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }

  const priceId = interval === "monthly" ? plan.stripe_price_monthly : plan.stripe_price_annual;
  if (!priceId) {
    console.error("MEMBERSHIP_CHECKOUT_MISSING_PRICE", { planKey, interval });
    return Response.json(
      { error: "This plan isn't ready for checkout yet. Please try again shortly." },
      { status: 409 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
  ];

  // Optional add-on: collects payment as a one-time invoice item alongside the
  // recurring subscription. What this add-on actually grants the member is not
  // yet defined — see the TODO in lib/membership-webhooks.ts where the ledger
  // grant would go once the benefit is decided.
  if (addOn && plan.add_on_price_cents > 0) {
    line_items.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${plan.name} membership add-on` },
        unit_amount: plan.add_on_price_cents,
      },
      quantity: 1,
    });
  }

  // This app has no Supabase auth / user accounts (confirmed: no @supabase/ssr or
  // supabase.auth usage anywhere), so there's no signed-in user to attach a
  // customer_email to in advance. Leave customer_email unset — Stripe's hosted
  // Checkout page collects the email itself.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // No payment_method_types override — Stripe mirrors whatever's enabled
    // in the Dashboard (Settings > Payment methods). Link was previously
    // excluded here via a hardcoded ["card"], but that also silently
    // excluded every other enabled method (e.g. Cash App Pay) and would
    // exclude any future one too. Link is now disabled account-wide in the
    // Dashboard instead, which is the only way to get "everything enabled
    // except Link" without a code change per method.
    // Lets staff look members up by phone at the counter (app/admin/memberships).
    phone_number_collection: { enabled: true },
    line_items,
    subscription_data: {
      metadata: { plan_key: planKey, billing_interval: interval },
    },
    // Members are identified by name first, email as a fallback — collected
    // on our own site (components/memberships/MembershipTiers.tsx) rather
    // than Stripe's own billing-name field, which is optional in Checkout
    // and often just whatever's printed on the card. Combined into a single
    // "name" string in the webhook (lib/membership-webhooks.ts) rather than
    // adding first/last columns, since nothing else in the app needs them
    // apart.
    metadata: {
      plan_key: planKey,
      billing_interval: interval,
      add_on: String(!!addOn),
      first_name: firstName,
      last_name: lastName,
    },
    success_url: `${baseUrl}/memberships/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/memberships`,
  });

  return Response.json({ url: session.url });
}
