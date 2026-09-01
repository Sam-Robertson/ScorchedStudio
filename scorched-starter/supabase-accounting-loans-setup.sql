-- Phase 4: loans register + amortization schedule.
--
-- One row per loan in `loans` (LiftFund, Square Capital, SBA — whichever
-- gets registered), one row per period in `loan_schedule`. The bank-rules
-- engine matches a real payment to the nearest unpaid schedule row by due
-- date (not "next row in period order") because a loan's early periods can
-- predate this system's Plaid transaction history — see loan-schedule.ts.
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  liability_account_code text not null references accounts(code),
  principal numeric(12,2) not null,
  annual_rate numeric(6,4) not null,
  term_months int not null,
  monthly_payment numeric(12,2) not null,
  funded_date date not null,
  status text not null default 'active' check (status in ('active','paid_off')),
  created_at timestamptz not null default now()
);

create table if not exists loan_schedule (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  period int not null,
  due_date date not null,
  payment numeric(12,2) not null,
  principal numeric(12,2) not null,
  interest numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  status text not null default 'scheduled' check (status in ('scheduled','paid','skipped')),
  bank_transaction_id uuid references bank_transactions(id),
  unique (loan_id, period)
);

create index if not exists loan_schedule_loan_id_status_idx on loan_schedule (loan_id, status);

alter table categorization_rules
  add column if not exists loan_id uuid references loans(id);
