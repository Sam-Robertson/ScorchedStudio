-- Run this in the Supabase SQL editor to set up Phase 2 (Bank Feeds) of the
-- accounting/reporting rebuild: Plaid items/accounts, the bank transaction
-- feed, and the categorization rules engine. Requires
-- supabase-accounting-setup.sql (Phase 1) to already be applied.
--
-- Plaid access tokens are encrypted in application code (AES-256-GCM, see
-- lib/accounting/encryption.ts) before being stored in access_token_enc —
-- this repo already does its crypto in app code (lib/admin-session.ts's
-- HMAC sessions) rather than via Supabase pgsodium/vault, which would need
-- Supabase-dashboard key management this app has no other use for.

DO $$ BEGIN
  CREATE TYPE txn_status AS ENUM ('unreviewed','posted','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS plaid_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name  TEXT NOT NULL,
  item_id           TEXT NOT NULL UNIQUE,
  access_token_enc  BYTEA NOT NULL,
  sync_cursor       TEXT,
  last_synced_at    TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'ok',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id       UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id    TEXT NOT NULL UNIQUE,
  ledger_account_id   UUID NOT NULL REFERENCES accounts(id),
  name                TEXT,
  mask                TEXT,
  kind                TEXT,  -- 'depository' | 'credit'
  default_location_id UUID REFERENCES locations(id),
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id       UUID NOT NULL REFERENCES bank_accounts(id),
  plaid_transaction_id  TEXT NOT NULL UNIQUE,
  date                  DATE NOT NULL,
  -- Plaid sign convention, NOT the journal_lines convention: positive =
  -- money leaving the account, negative = money coming in (for `credit`
  -- kind accounts, a positive amount is a purchase/charge, same polarity).
  -- Always take Math.abs() at the rules-engine boundary; direction is
  -- derived from the sign, not assumed from account kind.
  amount                NUMERIC(12,2) NOT NULL,
  name                  TEXT,
  merchant_name         TEXT,
  plaid_category        TEXT[],
  pending               BOOLEAN NOT NULL DEFAULT false,
  raw                   JSONB NOT NULL,
  status                txn_status NOT NULL DEFAULT 'unreviewed',
  rule_id               UUID,
  journal_entry_id      UUID REFERENCES journal_entries(id),
  location_id           UUID REFERENCES locations(id),
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON bank_transactions (status);
CREATE INDEX IF NOT EXISTS bank_transactions_account_idx ON bank_transactions (bank_account_id);
CREATE INDEX IF NOT EXISTS bank_transactions_date_idx ON bank_transactions (date);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority               INT NOT NULL DEFAULT 100,
  match_field            TEXT NOT NULL DEFAULT 'name', -- 'name' | 'merchant_name'
  match_regex            TEXT NOT NULL,
  bank_account_id        UUID REFERENCES bank_accounts(id), -- null = any
  amount_min             NUMERIC(12,2),
  amount_max             NUMERIC(12,2),
  direction              TEXT, -- 'debit' | 'credit' | null
  template               TEXT NOT NULL,
  target_account_id      UUID REFERENCES accounts(id),
  loan_id                UUID,
  location_id            UUID REFERENCES locations(id),
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_from_override  BOOLEAN NOT NULL DEFAULT false,
  hit_count              INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categorization_rules_priority_idx ON categorization_rules (priority) WHERE active;

DO $$ BEGIN
  ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES categorization_rules(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
