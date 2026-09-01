-- Run this in the Supabase SQL editor AFTER supabase-accounting-setup.sql.
-- Phase 3 (Revenue): Square daily settlements. Stripe follows the same
-- shape in a later pass.

CREATE TABLE IF NOT EXISTS revenue_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL,             -- 'square' | 'stripe'
  provider_key        TEXT NOT NULL UNIQUE,      -- e.g. 'square:orem:2026-08-24' — idempotency guard
  settle_date         DATE NOT NULL,
  location_id         UUID REFERENCES locations(id),
  gross_sales         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discounts           NUMERIC(12,2) NOT NULL DEFAULT 0,
  returns             NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_sales           NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_collected       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tips                NUMERIC(12,2) NOT NULL DEFAULT 0,  -- tracked for the record even though this business doesn't do tips
  gift_card_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,
  gift_card_redeemed  NUMERIC(12,2) NOT NULL DEFAULT 0,
  processing_fees     NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_collected      NUMERIC(12,2) NOT NULL DEFAULT 0,
  raw                 JSONB NOT NULL,
  journal_entry_id    UUID REFERENCES journal_entries(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revenue_settlements_date_idx ON revenue_settlements (settle_date);
