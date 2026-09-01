-- Phase 7: tax export.
--
-- Book depreciation (straight-line, computed by depreciation-job.ts) is not
-- necessarily tax depreciation (spec §11: "the CPA decides tax depreciation
-- from the register export") — this maps accounts to Schedule C lines for
-- the CPA's reference, it does not attempt to compute a tax return.
create table if not exists tax_line_mapping (
  account_code text primary key references accounts(code),
  tax_line text not null
);

insert into tax_line_mapping (account_code, tax_line) values
  ('4000', 'Gross receipts or sales (Line 1)'),
  ('4100', 'Gross receipts or sales (Line 1)'),
  ('4200', 'Gross receipts or sales (Line 1)'),
  ('4300', 'Gross receipts or sales (Line 1)'),
  ('4400', 'Gross receipts or sales (Line 1)'),
  ('5000', 'Cost of goods sold (Part III)'),
  ('6000', 'Wages (Line 26)'),
  ('6010', 'Taxes and licenses (Line 23)'),
  ('6020', 'Contract labor (Line 11)'),
  ('6100', 'Rent — other business property (Line 20b)'),
  ('6200', 'Advertising (Line 8)'),
  ('6300', 'Other expenses (Line 27a) — payment processing fees'),
  ('6400', 'Utilities (Line 25)'),
  ('6500', 'Supplies (Line 22)'),
  ('6600', 'Other expenses (Line 27a) — software'),
  ('6700', 'Insurance, other than health (Line 15)'),
  ('6800', 'Legal and professional services (Line 17)'),
  ('6900', 'Other expenses (Line 27a) — bank fees & misc'),
  ('6950', 'Car and truck expenses (Line 9)'),
  ('7000', 'Depreciation (Line 13) — book figure; CPA to compute tax depreciation from the fixed-asset register export'),
  ('8000', 'Interest, other (Line 16b)')
on conflict (account_code) do update set tax_line = excluded.tax_line;

-- Yearly totals by account mapped to a tax line, for a given calendar year.
create or replace function tax_export_year(p_year int)
returns table(code text, name text, type account_type, tax_line text, amount numeric)
language sql stable as $$
  select a.code, a.name, a.type, tlm.tax_line,
         sum(case when a.type = 'revenue' then -jl.amount else jl.amount end) as amount
  from journal_lines jl
  join journal_entries je on je.id = jl.entry_id
  join accounts a on a.id = jl.account_id
  left join tax_line_mapping tlm on tlm.account_code = a.code
  where extract(year from je.entry_date) = p_year
    and a.type in ('revenue','cogs','expense')
  group by 1,2,3,4
  order by 1;
$$;
