-- Run this in the Supabase SQL editor to set up Phase 1 (Foundation) of the
-- accounting/reporting rebuild: chart of accounts, general ledger with light
-- double-entry, period locks, and the audit log. See the build spec for full
-- context. Later phases (bank feeds, revenue, payroll, loans/assets, reports,
-- projections, tax export) get their own setup files.
--
-- `locations` already exists (key TEXT PRIMARY KEY 'orem'/'slc', used by
-- booking availability and the location-tier admin login). Rather than
-- create a second locations table on a uuid PK as the spec's schema shows,
-- this adds a uuid surrogate to the existing table and every accounting
-- table FKs to that. `key` remains the primary key and nothing about the
-- existing booking/location-login code changes.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS locations_id_key ON locations (id);

-- ── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','cogs','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE journal_source_type AS ENUM ('bank','revenue','payroll','manual','depreciation','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Chart of accounts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        account_type NOT NULL,
  is_cash     BOOLEAN NOT NULL DEFAULT false,
  is_contra   BOOLEAN NOT NULL DEFAULT false,
  parent_id   UUID REFERENCES accounts(id),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── General ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date  DATE NOT NULL,
  memo        TEXT,
  source      journal_source_type NOT NULL,
  source_id   UUID,
  template    TEXT,
  location_id UUID REFERENCES locations(id),
  locked      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No end-user UUIDs exist in this app's auth (admin/location sessions are
  -- signed HMAC tokens, not Supabase Auth users) — this records the acting
  -- role/name as text rather than a fabricated uuid.
  created_by  TEXT
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id),
  -- Signed: debit positive, credit negative. Every report view depends on
  -- this convention (revenue/liability/equity balances are shown as -amount).
  amount      NUMERIC(12,2) NOT NULL,
  memo        TEXT,
  location_id UUID REFERENCES locations(id)
);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines (account_id);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx   ON journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS journal_entries_date_idx  ON journal_entries (entry_date);

-- Every journal entry must balance to zero. Deferred so a multi-row insert
-- of an entry's lines (all lines in one statement/transaction) only checks
-- once all rows are in, not after each individual row.
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s NUMERIC;
  eid UUID;
BEGIN
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(amount), 0) INTO s FROM journal_lines WHERE entry_id = eid;
  IF abs(s) > 0.005 THEN
    RAISE EXCEPTION 'Journal entry % does not balance (sum=%)', eid, s;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS journal_balanced ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- ── Period locks ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS period_locks (
  period_month DATE PRIMARY KEY,      -- first of month
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT
);

-- Reject any insert/update/delete of a journal entry (or its lines) whose
-- entry_date falls in a locked month. A locked table with nothing enforcing
-- it isn't the feature the spec asks for, so this is the enforcement.
CREATE OR REPLACE FUNCTION assert_period_unlocked() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  d DATE;
BEGIN
  -- Flipping just the `locked` display flag must stay possible even inside
  -- a locked period — otherwise, once a period is locked, no entry in it
  -- could ever be marked locked, making the column permanently unreachable.
  -- period_locks is the actual enforcement; `locked` is a per-entry mirror
  -- of that state for display, so this is the one column exempt from it.
  IF TG_OP = 'UPDATE'
     AND NEW.entry_date = OLD.entry_date
     AND NEW.memo IS NOT DISTINCT FROM OLD.memo
     AND NEW.source = OLD.source
     AND NEW.source_id IS NOT DISTINCT FROM OLD.source_id
     AND NEW.template IS NOT DISTINCT FROM OLD.template
     AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
  THEN
    RETURN NEW;
  END IF;

  d := COALESCE(NEW.entry_date, OLD.entry_date);
  IF EXISTS (
    SELECT 1 FROM period_locks WHERE period_month = date_trunc('month', d)::date
  ) THEN
    RAISE EXCEPTION 'Period % is locked', date_trunc('month', d)::date;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS journal_entries_period_lock ON journal_entries;
CREATE TRIGGER journal_entries_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION assert_period_unlocked();

CREATE OR REPLACE FUNCTION assert_period_unlocked_line() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  d DATE;
BEGIN
  SELECT entry_date INTO d FROM journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF d IS NOT NULL AND EXISTS (
    SELECT 1 FROM period_locks WHERE period_month = date_trunc('month', d)::date
  ) THEN
    RAISE EXCEPTION 'Period % is locked', date_trunc('month', d)::date;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS journal_lines_period_lock ON journal_lines;
CREATE TRIGGER journal_lines_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION assert_period_unlocked_line();

-- ── Audit log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      TEXT,                -- role/name from the admin session, see journal_entries.created_by
  action     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id     UUID,
  diff       JSONB
);

-- ── Atomic posting primitive ────────────────────────────────────────────────
-- Every phase (manual entry now; bank feeds, revenue, payroll, loans, and
-- depreciation later) needs to insert one journal_entries row plus its
-- journal_lines in a single transaction, since the balance trigger on
-- journal_lines is deferred to end-of-transaction, not end-of-statement.
-- Two separate supabase-js calls (insert entry, then insert lines) span two
-- transactions and can't give that guarantee. This function is the one
-- write path every phase's ingestion code should call through.
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_entry_date  DATE,
  p_memo        TEXT,
  p_source      journal_source_type,
  p_source_id   UUID,
  p_template    TEXT,
  p_location_id UUID,
  p_created_by  TEXT,
  p_lines       JSONB   -- [{account_code, amount, memo?, location_id?}, ...]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_entry_id   UUID;
  v_line       JSONB;
  v_account_id UUID;
BEGIN
  IF jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION 'post_journal_entry requires at least one line';
  END IF;

  INSERT INTO journal_entries (entry_date, memo, source, source_id, template, location_id, created_by)
  VALUES (p_entry_date, p_memo, p_source, p_source_id, p_template, p_location_id, p_created_by)
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT id INTO v_account_id FROM accounts WHERE code = (v_line->>'account_code');
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Unknown account code %', v_line->>'account_code';
    END IF;

    INSERT INTO journal_lines (entry_id, account_id, amount, memo, location_id)
    VALUES (
      v_entry_id,
      v_account_id,
      (v_line->>'amount')::numeric,
      v_line->>'memo',
      COALESCE(NULLIF(v_line->>'location_id', '')::uuid, p_location_id)
    );
  END LOOP;

  RETURN v_entry_id;
END $$;

-- ── Seed: chart of accounts (spec §2) ─────────────────────────────────────

INSERT INTO accounts (code, name, type, is_cash, is_contra) VALUES
  ('1000', 'Chase Business Checking',      'asset',     true,  false),
  ('1010', 'UCCU Checking',                'asset',     true,  false),
  ('1100', 'Square Clearing',              'asset',     false, false),
  ('1110', 'Stripe Clearing',              'asset',     false, false),
  ('1200', 'Security Deposits',            'asset',     false, false),
  ('1500', 'Fixed Assets',                 'asset',     false, false),
  ('1510', 'Accumulated Depreciation',     'asset',     false, true),
  ('2000', 'Chase Ink Card',               'liability', false, false),
  ('2010', 'Amex Blue Business Plus',      'liability', false, false),
  ('2020', 'Amex Blue Business Cash',      'liability', false, false),
  ('2030', 'U.S. Bank Card 1370',          'liability', false, false),
  -- Not in the spec's original chart — discovered when linking U.S. Bank
  -- via Plaid, which surfaced a second card under the same login. Confirmed
  -- with the user it's an active business card (2026-09-01).
  ('2040', 'U.S. Bank Card 1386',          'liability', false, false),
  ('2100', 'Sales Tax Payable',            'liability', false, false),
  ('2200', 'Deferred Revenue (Gift Cards)','liability', false, false),
  ('2300', 'Payroll Clearing',             'liability', false, false),
  ('2500', 'LiftFund Loan',                'liability', false, false),
  ('2510', 'Square Capital Advance',       'liability', false, false),
  ('2520', 'SBA Loan',                     'liability', false, false),
  ('3000', 'Owner Contributions',          'equity',    false, false),
  ('3010', 'Owner Draws',                  'equity',    false, false),
  ('3900', 'Retained Earnings',            'equity',    false, false),
  ('4000', 'Session Revenue',              'revenue',   false, false),
  ('4100', 'Membership Revenue',           'revenue',   false, false),
  ('4200', 'Course Revenue',               'revenue',   false, false),
  ('4300', 'Event Revenue',                'revenue',   false, false),
  ('4400', 'Retail Revenue',               'revenue',   false, false),
  ('5000', 'Cost of Goods Sold',           'cogs',      false, false),
  ('6000', 'Payroll: Wages',               'expense',   false, false),
  ('6010', 'Payroll: Employer Taxes',      'expense',   false, false),
  ('6020', 'Contractors',                  'expense',   false, false),
  ('6100', 'Rent',                         'expense',   false, false),
  ('6200', 'Marketing',                    'expense',   false, false),
  ('6300', 'Payment Processing Fees',      'expense',   false, false),
  ('6400', 'Utilities',                    'expense',   false, false),
  ('6500', 'Supplies',                     'expense',   false, false),
  ('6600', 'Software',                     'expense',   false, false),
  ('6700', 'Insurance',                    'expense',   false, false),
  ('6800', 'Professional Services',        'expense',   false, false),
  ('6900', 'Bank Fees & Misc',             'expense',   false, false),
  ('6950', 'Vehicle',                      'expense',   false, false),
  ('7000', 'Depreciation',                 'expense',   false, false),
  ('8000', 'Interest Expense',             'expense',   false, false)
ON CONFLICT (code) DO NOTHING;
