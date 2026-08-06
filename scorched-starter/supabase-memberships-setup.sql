-- Run this in the Supabase SQL editor to set up membership plans, memberships,
-- and the entrance ledger.
--
-- No customers table exists in this project (bookings and waivers store name/email
-- directly), so memberships store email + stripe_customer_id rather than a foreign
-- key to a customers table.

-- Plan configuration (tunable without code changes)
CREATE TABLE IF NOT EXISTS membership_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   TEXT NOT NULL UNIQUE CHECK (key IN ('ember', 'blaze')),
  name                  TEXT NOT NULL,
  tagline               TEXT NOT NULL,
  entrances_per_period  INT NOT NULL,
  wood_credit_cents     INT NOT NULL DEFAULT 0,
  wood_discount_pct     INT NOT NULL DEFAULT 0,
  price_monthly_cents   INT NOT NULL,
  price_annual_cents    INT NOT NULL,
  stripe_price_monthly  TEXT,
  stripe_price_annual   TEXT,
  add_on_price_cents    INT NOT NULL DEFAULT 0,
  active                BOOLEAN NOT NULL DEFAULT true
);

-- Memberships. stripe_subscription_id is the natural idempotency key for
-- webhook upserts (checkout.session.completed can be delivered more than once).
CREATE TABLE IF NOT EXISTS memberships (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                         TEXT NOT NULL,
  stripe_customer_id            TEXT NOT NULL,
  stripe_subscription_id        TEXT NOT NULL UNIQUE,
  plan_key                      TEXT NOT NULL REFERENCES membership_plans(key),
  billing_interval               TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  status                         TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  current_period_end            TIMESTAMPTZ,
  entrances_remaining           INT NOT NULL DEFAULT 0,
  wood_credit_remaining_cents   INT NOT NULL DEFAULT 0,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memberships_email_idx ON memberships (email);

-- Source of truth for entrances. entrances_remaining on memberships is a cached
-- sum of this ledger, kept in sync by application code on each insert.
--
-- The UNIQUE(membership_id, reason) constraint is what makes granting idempotent:
-- webhook handlers write a deterministic reason per event (e.g. "checkout:cs_123"
-- or "renewal:in_456") and upsert with ignoreDuplicates, so a retried Stripe event
-- can never grant entrances twice.
CREATE TABLE IF NOT EXISTS membership_entrance_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  delta          INT NOT NULL,
  reason         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (membership_id, reason)
);

-- Seed the two tiers. stripe_price_monthly / stripe_price_annual start NULL —
-- run scripts/setup-membership-stripe.mjs (or set them manually) once the Stripe
-- Products/Prices exist, before the /memberships page can accept checkouts.
INSERT INTO membership_plans
  (key, name, tagline, entrances_per_period, wood_credit_cents, wood_discount_pct, price_monthly_cents, price_annual_cents, add_on_price_cents, active)
VALUES
  ('ember', 'Ember',
   'Perfect for date nights and casual visits. Two entrances a month, you just cover the wood.',
   2, 0, 15, 2500, 23988, 7500, true),
  ('blaze', 'Blaze',
   'For makers who want to get good. Four visits a month, a wood credit, and a member discount on everything you burn.',
   4, 3000, 25, 6000, 59988, 5000, true)
ON CONFLICT (key) DO NOTHING;
