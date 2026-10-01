// lib/booking-payments.ts (server only)
//
// Card money moving on a booking after it exists: the extra payment when a
// paid party grows, and refunds when it shrinks or cancels.
//
// A booking's first card payment lives on the booking row itself
// (stripe_payment_intent_id), as it always has. Any later payment is a row in
// booking_payments (supabase-booking-payments-setup.sql), because a refund has
// to know every PaymentIntent the money came from and one column cannot hold
// two.
import Stripe from "stripe";
import { getSupabase } from "@/lib/supabase";
import { allocateRefund } from "@/lib/booking-rules";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type ExtraPayment = {
  id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  refunded_cents: number;
};

type PaidBooking = { id: string; stripe_payment_intent_id: string | null; amount_paid: number };

// Until the migration is run the table does not exist. That is a known state,
// not a failure: no extra payment can have been taken without it, so reads
// treat it as "none" and the pay route refuses to start one.
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function extraPaymentsEnabled(): Promise<boolean> {
  const { error } = await getSupabase().from("booking_payments").select("id").limit(1);
  if (error && !isMissingTable(error)) console.error("BOOKING_PAYMENTS_CHECK_ERROR", error);
  return !error;
}

// Newest first, which is also the order refunds are taken in.
export async function getExtraPayments(bookingId: string): Promise<ExtraPayment[]> {
  const { data, error } = await getSupabase()
    .from("booking_payments")
    .select("id, stripe_payment_intent_id, amount_cents, refunded_cents")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (isMissingTable(error)) return [];
  // Any other failure must stop a refund rather than quietly skip a payment.
  if (error) throw new Error(`booking_payments lookup failed: ${error.message}`);
  return (data ?? []) as ExtraPayment[];
}

async function markRefunded(payment: ExtraPayment, cents: number): Promise<void> {
  const { error } = await getSupabase()
    .from("booking_payments")
    .update({ refunded_cents: payment.refunded_cents + cents })
    .eq("id", payment.id);
  // The money has already gone back. Throwing here would tell the customer the
  // refund failed when it did not, so this is logged for a human instead.
  if (error) console.error("BOOKING_PAYMENT_MARK_REFUNDED_ERROR", { payment: payment.id, cents, error });
}

// Refunds part of what a booking has paid, newest payment first.
//
// `reason` goes into the Stripe idempotency key and must identify this one
// change (the booking, what it had paid, what it is shrinking to), so a retry
// after a failure further down cannot refund the same money twice.
export async function refundPartOfBooking(booking: PaidBooking, cents: number, reason: string): Promise<void> {
  if (cents <= 0 || !booking.stripe_payment_intent_id) return;

  const extras = await getExtraPayments(booking.id);
  const plan = allocateRefund(
    [
      ...extras.map((p) => ({ id: p.stripe_payment_intent_id, remaining: p.amount_cents - p.refunded_cents })),
      { id: booking.stripe_payment_intent_id, remaining: null },
    ],
    cents
  );

  for (const { id, amount } of plan) {
    await stripe.refunds.create({ payment_intent: id, amount }, { idempotencyKey: `${reason}-${id}` });
    const extra = extras.find((p) => p.stripe_payment_intent_id === id);
    if (extra) await markRefunded(extra, amount);
  }
}

// Refunds everything a booking has paid by card, for a cancellation. Returns
// the number of cents that went back.
export async function refundAllOfBooking(booking: PaidBooking): Promise<number> {
  if (!booking.stripe_payment_intent_id || booking.amount_paid <= 0) return 0;

  const extras = await getExtraPayments(booking.id);
  for (const extra of extras) {
    const remaining = extra.amount_cents - extra.refunded_cents;
    if (remaining <= 0) continue;
    await stripe.refunds.create(
      { payment_intent: extra.stripe_payment_intent_id, amount: remaining },
      { idempotencyKey: `booking-cancel-${extra.stripe_payment_intent_id}` }
    );
    await markRefunded(extra, remaining);
  }

  // No amount: Stripe refunds whatever is left on the first payment, which is
  // right whether or not part of it went back in an earlier party change.
  await stripe.refunds.create(
    { payment_intent: booking.stripe_payment_intent_id },
    { idempotencyKey: `booking-cancel-${booking.stripe_payment_intent_id}` }
  );

  return booking.amount_paid;
}

export type ApplyExtraResult = "applied" | "already_applied" | "unavailable";

// Records a later card payment against a booking that already has a first one.
// The unique PaymentIntent id is what makes this safe to call twice: the
// confirm route and the Stripe webhook both report the same payment, and only
// the caller whose insert lands goes on to raise amount_paid.
export async function recordExtraPayment(bookingId: string, intent: Stripe.PaymentIntent): Promise<ApplyExtraResult> {
  const sb = getSupabase();

  const { error: insertError } = await sb.from("booking_payments").insert({
    booking_id: bookingId,
    stripe_payment_intent_id: intent.id,
    amount_cents: intent.amount,
  });

  if (insertError?.code === "23505") return "already_applied";
  if (insertError) {
    console.error("BOOKING_PAYMENT_INSERT_ERROR", insertError);
    return "unavailable";
  }

  // amount_paid is raised with a compare-and-set so a refund landing at the
  // same moment is never overwritten by a stale total.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current } = await sb.from("bookings").select("amount_paid").eq("id", bookingId).maybeSingle();
    if (!current) break;
    const { data: updated } = await sb
      .from("bookings")
      .update({ amount_paid: current.amount_paid + intent.amount })
      .eq("id", bookingId)
      .eq("amount_paid", current.amount_paid)
      .select("id")
      .maybeSingle();
    if (updated) return "applied";
  }

  // The payment is on record but the booking total is behind. Nothing to undo:
  // a human fixes the total, and the customer has their Stripe receipt.
  console.error("BOOKING_PAYMENT_TOTAL_NOT_UPDATED", { bookingId, paymentIntentId: intent.id, amount: intent.amount });
  return "applied";
}

export async function hasExtraPayment(paymentIntentId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("booking_payments")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return !!data;
}
