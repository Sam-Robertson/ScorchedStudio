-- Run this in the Supabase SQL editor (paste as a single line).
--
-- One booking per Stripe payment. The confirm route and the webhook both
-- create the booking for a payment, and with no unique index the two could
-- each pass the "does it exist yet" check and both insert. Remove any clones
-- before running this, or the index creation fails.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_unique ON bookings (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
