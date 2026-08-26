-- Run this in the Supabase SQL editor to set up email+password customer
-- accounts.
--
-- Replaces the earlier passwordless (magic-link) design, which never had a
-- customers table — bookings, memberships, and enrollments are all still
-- just keyed by email, this table only exists to hold login credentials.
-- password_hash is "scrypt:<salt-hex>:<hash-hex>", produced by
-- lib/customer-password.ts; nothing but that module ever reads or writes it.

CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (email);
