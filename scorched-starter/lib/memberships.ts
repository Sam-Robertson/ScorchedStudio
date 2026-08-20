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
  name: string | null;
  phone: string | null;
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

export type RedemptionType = "entrance" | "wood_credit";

export type MembershipRedemptionRecord = {
  id: string;
  membership_id: string;
  type: RedemptionType;
  amount: number;
  redeemed_by: string;
  square_order_id: string | null;
  notes: string | null;
  created_at: string;
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
  name?: string | null;
  phone?: string | null;
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

// Staff-facing lookup by name, email, or phone — the search box on
// /admin/memberships. Small member base, so a simple ilike-any-field scan is
// fine; no need for a dedicated search index.
export async function searchMemberships(query: string): Promise<MembershipRecord[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await getSupabase()
    .from("memberships")
    .select("*")
    .or(`email.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data as MembershipRecord[];
}

export async function getMembershipById(id: string): Promise<MembershipRecord | null> {
  const { data, error } = await getSupabase()
    .from("memberships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as MembershipRecord | null;
}

export async function getRedemptionsForMembership(membershipId: string): Promise<MembershipRedemptionRecord[]> {
  const { data, error } = await getSupabase()
    .from("membership_redemptions")
    .select("*")
    .eq("membership_id", membershipId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as MembershipRedemptionRecord[];
}

// Atomically decrements the membership's balance via the redeem_membership_entitlement
// SQL function (see supabase-membership-redemptions-setup.sql) and, only if that
// succeeded, writes the ledger row. Returns null if the redemption was blocked
// (membership not active, or balance insufficient for the requested amount).
export async function redeemEntitlement(
  membershipId: string,
  opts: { type: RedemptionType; amount: number; redeemedBy: string; squareOrderId?: string; notes?: string }
): Promise<{ membership: MembershipRecord; redemption: MembershipRedemptionRecord } | null> {
  const supabase = getSupabase();

  const { data: updated, error: rpcError } = await supabase
    .rpc("redeem_membership_entitlement", {
      p_membership_id: membershipId,
      p_type: opts.type,
      p_amount: opts.amount,
    })
    .single();
  if (rpcError) throw rpcError;
  // Belt-and-suspenders: the SQL function returns SQL NULL when blocked (see
  // supabase-membership-redemptions-setup.sql), which PostgREST sends as JSON
  // null — but check a required field too, in case a future edit to the
  // function reintroduces a "row of all-null fields" (truthy object) instead.
  if (!updated || (updated as MembershipRecord).id == null) return null;

  const { data: redemption, error: insertError } = await supabase
    .from("membership_redemptions")
    .insert({
      membership_id: membershipId,
      type: opts.type,
      amount: opts.amount,
      redeemed_by: opts.redeemedBy,
      square_order_id: opts.squareOrderId || null,
      notes: opts.notes || null,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  return { membership: updated as MembershipRecord, redemption: redemption as MembershipRedemptionRecord };
}
