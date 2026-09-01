-- Phase 4: fixed assets register + monthly straight-line depreciation.
--
-- capex bank-rule postings (Dr 1500, Cr checking) don't carry per-item cost
-- basis or useful life — this table is where that detail lives. One row
-- per asset; the depreciation job (lib/accounting/depreciation-job.ts)
-- posts one combined monthly entry (Dr 7000, Cr 1510) for the sum of all
-- active assets' monthly depreciation, keyed by month so re-running is safe.
create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  cost numeric(12,2) not null,
  in_service_date date not null,
  useful_life_months int not null,
  bank_transaction_id uuid references bank_transactions(id),
  status text not null default 'active' check (status in ('active','disposed')),
  created_at timestamptz not null default now()
);

create table if not exists depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  period_key text not null unique, -- 'YYYY-MM'
  amount numeric(12,2) not null,
  journal_entry_id uuid,
  created_at timestamptz not null default now()
);
