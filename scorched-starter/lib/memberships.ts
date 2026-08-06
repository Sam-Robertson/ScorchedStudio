// lib/memberships.ts — server-only data layer for membership plans, memberships,
// and the entrance ledger. Keeps the checkout route and the Stripe webhook thin.
import { getSupabase } from "@/lib/supabase";

export type PlanKey = "ember" | "blaze";
export type BillingInterval = "monthly" | "annual";
export type MembershipStatus = "active" | "past_due" | "canceled" | "incomplete";

export type MembershipPlan = {
  id: string;
  key: PlanKey;
  name: string;
  tagline: string;
  entrances_per_period: number;
  wood_credit_cents: number;
  wood_discount_pct: number;
  price_monthly_cents: number;
  price_annual_cents: number;
  stripe_price_monthly: string | null;
  stripe_price_annual: string | null;
  add_on_price_cents: number;
  active: boolean;
};

export type MembershipRecord = {
  id: string;
  email: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan_key: PlanKey;
  billing_interval: BillingInterval;
  status: MembershipStatus;
  current_period_end: string | null;
  entrances_remaining: number;
  wood_credit_remaining_cents: number;
  created_at: string;
  updated_at: string;
};

export async function getActivePlans(): Promise<MembershipPlan[]> {
  const { data, error } = await getSupabase()
    .from("membership_plans")
    .select("*")
    .eq("active", true)
    .order("price_monthly_cents", { ascending: true });
  if (error) throw error;
  return data as MembershipPlan[];
}

export async function getPlanByKey(key: string): Promise<MembershipPlan | null> {
  const { data, error } = await getSupabase()
    .from("membership_plans")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data as MembershipPlan | null;
}

export async function getMembershipBySubscriptionId(
  stripeSubscriptionId: string
): Promise<MembershipRecord | null> {
  const { data, error } = await getSupabase()
    .from("memberships")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data as MembershipRecord | null;
}

// Creates the membership row on first checkout, or updates status/period/plan
// fields on a retried event. Never touches entrances_remaining or
// wood_credit_remaining_cents here — those are ledger-managed, granted
// separately via grantLedgerEntry so retried webhooks can't double-grant.
export async function upsertMembershipShell(input: {
  email: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan_key: PlanKey;
  billing_interval: BillingInterval;
  status: MembershipStatus;
  current_period_end: string | null;
}): Promise<MembershipRecord> {
  const { data, error } = await getSupabase()
    .from("memberships")
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "stripe_subscription_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as MembershipRecord;
}

export async function syncMembershipStatus(input: {
  stripe_subscription_id: string;
  status: MembershipStatus;
  current_period_end: string | null;
}): Promise<void> {
  const { error } = await getSupabase()
    .from("memberships")
    .update({
      status: input.status,
      current_period_end: input.current_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", input.stripe_subscription_id);
  if (error) throw error;
}

// Idempotently grants (or resets) entrances and wood credit for a membership.
// `reason` must be a deterministic per-event key (e.g. "checkout:cs_123" or
// "renewal:in_456") — the UNIQUE(membership_id, reason) constraint on the ledger
// makes a retried Stripe event a no-op instead of a double grant.
//
// entrancesDelta is ADDED to the running balance (rollover — unused entrances
// carry forward). woodCreditCents, when provided, is SET (topped back up to the
// plan amount), not added.
export async function grantMembershipPeriod(
  membership: MembershipRecord,
  opts: { entrancesDelta: number; reason: string; woodCreditCents?: number }
): Promise<void> {
  const supabase = getSupabase();

  const { data: ledgerRow, error: ledgerError } = await supabase
    .from("membership_entrance_ledger")
    .upsert(
      { membership_id: membership.id, delta: opts.entrancesDelta, reason: opts.reason },
      { onConflict: "membership_id,reason", ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();
  if (ledgerError) throw ledgerError;

  // No row came back: this exact (membership_id, reason) pair was already
  // granted by a previous delivery of the same event. Skip the balance update.
  if (!ledgerRow) return;

  const update: Record<string, unknown> = {
    entrances_remaining: membership.entrances_remaining + opts.entrancesDelta,
    updated_at: new Date().toISOString(),
  };
  if (opts.woodCreditCents !== undefined) {
    update.wood_credit_remaining_cents = opts.woodCreditCents;
  }

  const { error: updateError } = await supabase
    .from("memberships")
    .update(update)
    .eq("id", membership.id);
  if (updateError) throw updateError;
}
