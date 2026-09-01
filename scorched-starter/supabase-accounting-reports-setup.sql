-- Phase 5: reports and lender pack (spec §7, verbatim).
--
-- All views read cash-basis journal data directly — no separate reporting
-- table to keep in sync. Month = date_trunc('month', entry_date).

-- Account balances by month (signed: debits positive)
create or replace view v_account_month as
select date_trunc('month', je.entry_date)::date as period_month,
       jl.location_id, a.id as account_id, a.code, a.name, a.type,
       sum(jl.amount) as amount
from journal_lines jl
join journal_entries je on je.id = jl.entry_id
join accounts a on a.id = jl.account_id
group by 1,2,3,4,5,6;

-- Monthly P&L (revenue/cogs/expense are credit-natural; flip signs for presentation)
create or replace view v_pl_monthly as
select period_month, location_id,
  sum(case when type='revenue' then -amount else 0 end)                       as revenue,
  sum(case when type='cogs'    then  amount else 0 end)                       as cogs,
  sum(case when type='revenue' then -amount else 0 end)
    - sum(case when type='cogs' then amount else 0 end)                       as gross_profit,
  sum(case when type='expense' and code not in ('7000','8000') then amount else 0 end) as operating_expenses,
  sum(case when type='revenue' then -amount else 0 end)
    - sum(case when type='cogs' then amount else 0 end)
    - sum(case when type='expense' and code not in ('7000','8000') then amount else 0 end) as ebitda,
  sum(case when code='7000' then amount else 0 end)                           as depreciation,
  sum(case when code='8000' then amount else 0 end)                           as interest,
  sum(case when type='revenue' then -amount else 0 end)
    - sum(case when type in ('cogs','expense') then amount else 0 end)        as net_income
from v_account_month
group by 1,2;

-- Line-item P&L for the statement layout
create or replace view v_pl_lines as
select period_month, location_id, code, name, type,
       case when type='revenue' then -amount else amount end as amount
from v_account_month
where type in ('revenue','cogs','expense');

-- Balance sheet as of a date
create or replace function balance_sheet(as_of date)
returns table(code text, name text, type account_type, balance numeric) language sql stable as $$
  select a.code, a.name, a.type,
         sum(case when a.type in ('asset') then jl.amount else -jl.amount end) as balance
  from journal_lines jl join journal_entries je on je.id=jl.entry_id
  join accounts a on a.id=jl.account_id
  where je.entry_date <= as_of and a.type in ('asset','liability','equity')
  group by 1,2,3 order by 1;
$$;

-- Seasonality index: month revenue vs trailing-12 average
create or replace view v_seasonality as
select period_month, revenue,
       avg(revenue) over (order by period_month rows between 11 preceding and current row) as ttm_avg,
       revenue / nullif(avg(revenue) over (order by period_month rows between 11 preceding and current row),0) as index
from (select period_month, sum(revenue) revenue from v_pl_monthly group by 1) t;

-- Normalization lines, never mixed into base rows
create table if not exists pl_adjustments (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  label text not null,
  amount numeric(12,2) not null, -- positive = add back to operating income
  note text,
  include boolean default true
);

-- Normalized P&L: base + labeled adjustments, never mixed into base rows
create or replace view v_pl_normalized as
select p.period_month, p.ebitda,
       coalesce(sum(adj.amount) filter (where adj.include),0) as adjustments,
       p.ebitda + coalesce(sum(adj.amount) filter (where adj.include),0) as ebitda_normalized
from (select period_month, sum(ebitda) ebitda from v_pl_monthly group by 1) p
left join pl_adjustments adj on adj.period_month = p.period_month
group by 1,2;

-- The 24-month model as data (loaded separately from the business's own
-- projection model — this table starts empty; see /admin/accounting/projections).
create table if not exists projection_months (
  period_month date primary key,
  revenue numeric(12,2), cogs numeric(12,2), payroll numeric(12,2), rent numeric(12,2),
  marketing numeric(12,2), other_opex numeric(12,2), ebitda numeric(12,2), debt_service numeric(12,2)
);

-- Projection vs actual
create or replace view v_projection_vs_actual as
select pm.period_month,
       pm.revenue as proj_revenue, a.revenue as act_revenue, a.revenue - pm.revenue as var_revenue,
       pm.ebitda  as proj_ebitda,  a.ebitda  as act_ebitda,  a.ebitda  - pm.ebitda  as var_ebitda,
       pm.debt_service
from projection_months pm
left join (select period_month, sum(revenue) revenue, sum(ebitda) ebitda from v_pl_monthly group by 1) a using (period_month);

-- Trailing-12 DSCR (EBITDA / principal + interest actually paid)
create or replace view v_dscr_ttm as
with e as (select period_month, sum(ebitda) ebitda from v_pl_monthly group by 1),
     ds as (
       select date_trunc('month', je.entry_date)::date period_month,
              sum(case when a.type='liability' and a.code in ('2500','2510','2520') then -jl.amount else 0 end)
              + sum(case when a.code='8000' then jl.amount else 0 end) as debt_service
       from journal_lines jl join journal_entries je on je.id=jl.entry_id join accounts a on a.id=jl.account_id
       where je.template = 'loan_payment' group by 1)
select e.period_month,
       sum(e.ebitda) over w as ebitda_ttm,
       sum(coalesce(ds.debt_service,0)) over w as debt_service_ttm,
       sum(e.ebitda) over w / nullif(sum(coalesce(ds.debt_service,0)) over w,0) as dscr_ttm
from e left join ds using (period_month)
window w as (order by e.period_month rows between 11 preceding and current row);

-- Cash flow (cash basis, derived): net change in cash accounts by month,
-- split by template into operating / investing / financing.
create or replace view v_cash_flow_monthly as
select date_trunc('month', je.entry_date)::date as period_month,
  case
    when je.template in ('expense','cogs','revenue_settlement','payroll_clearing','sales_tax_remit','card_interest','ignore') then 'operating'
    when je.template in ('capex','security_deposit') then 'investing'
    when je.template in ('loan_proceeds','loan_payment','owner_contribution','owner_draw') then 'financing'
    else 'operating'
  end as activity,
  sum(jl.amount) as net_change
from journal_lines jl
join journal_entries je on je.id = jl.entry_id
join accounts a on a.id = jl.account_id
where a.type = 'asset' and a.code in ('1000','1100','1110')
group by 1,2;
