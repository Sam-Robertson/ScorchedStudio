// scripts/setup-membership-stripe.mjs
//
// One-time setup: creates the two membership Products in Stripe (Ember, Blaze),
// each with a monthly and an annual recurring Price, then writes those price IDs
// onto the matching membership_plans row in Supabase.
//
// This is NOT run automatically — run it yourself once, after applying
// supabase-memberships-setup.sql. It talks to whatever Stripe account
// STRIPE_SECRET_KEY points at, so double check that key before running:
//
//   node --env-file=.env scripts/setup-membership-stripe.mjs
//
// Safe to re-run: any plan that already has both stripe_price_monthly and
// stripe_price_annual set in Supabase is skipped rather than recreated.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PLANS = [
  { key: "ember", name: "Ember", priceMonthlyCents: 2500, priceAnnualCents: 23988 },
  { key: "blaze", name: "Blaze", priceMonthlyCents: 6000, priceAnnualCents: 59988 },
];

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
  if (process.env.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
    console.warn("STRIPE_SECRET_KEY is a LIVE key — this will create real, live Products and Prices.\n");
  }

  for (const plan of PLANS) {
    const { data: existing, error } = await supabase
      .from("membership_plans")
      .select("stripe_price_monthly, stripe_price_annual")
      .eq("key", plan.key)
      .single();
    if (error) throw error;

    if (existing.stripe_price_monthly && existing.stripe_price_annual) {
      console.log(`${plan.name}: already has both price IDs, skipping.`);
      continue;
    }

    const product = await stripe.products.create({ name: `${plan.name} Membership` });

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.priceMonthlyCents,
      recurring: { interval: "month" },
    });

    const annualPrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.priceAnnualCents,
      recurring: { interval: "year" },
    });

    const { error: updateError } = await supabase
      .from("membership_plans")
      .update({
        stripe_price_monthly: monthlyPrice.id,
        stripe_price_annual: annualPrice.id,
      })
      .eq("key", plan.key);
    if (updateError) throw updateError;

    console.log(
      `${plan.name}: product ${product.id}, monthly ${monthlyPrice.id}, annual ${annualPrice.id}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
