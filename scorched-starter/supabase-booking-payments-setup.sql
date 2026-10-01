-- Run this in the Supabase SQL editor.
--
-- Card payments made on a booking after its first one: the difference a
-- customer pays when a paid party grows. The first payment stays where it has
-- always been, on bookings.stripe_payment_intent_id. A refund (smaller party,
-- or a cancellation) has to reach every PaymentIntent the money came from, and
-- one column cannot hold two.
--
-- Until this is run the site still works: paying for a brand new booking,
-- paying for an unpaid reservation, and refunds are unaffected. Only paying the
-- difference online for extra guests is switched off, and the edit page tells
-- the customer the balance is collected in studio instead.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS booking_payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id               UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  -- Unique so the confirm route and the Stripe webhook reporting the same
  -- payment record it once.
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  refunded_cents           INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON booking_payments (booking_id);

-- Enabled with no policies: anon and authenticated are denied, and the service
-- role the site uses bypasses RLS.
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;
