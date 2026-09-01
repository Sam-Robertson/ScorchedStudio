-- Run this in the Supabase SQL editor AFTER supabase-accounting-bankfeeds-setup.sql
-- and after linking at least one Plaid account. Seeds the categorization
-- rules from build spec §6.
--
-- IMPORTANT — these regexes are transcribed from the spec's own text, which
-- says outright: "adjust regexes to real Plaid strings." None of them have
-- been checked against an actual Plaid `name` value yet, because no bank
-- account is linked. Before trusting a single auto-posted entry from these
-- rules, run:
--
--   select distinct name, merchant_name from bank_transactions order by 1;
--
-- against a few weeks of real synced data, and fix any rule whose regex
-- doesn't actually match what Plaid sends. A rule that matches nothing is
-- invisible (the transaction quietly lands in the inbox, which is safe);
-- a rule that matches the wrong thing posts to the wrong account and is
-- much easier to catch early than after a period is locked.
--
-- Three deliberate deviations from the spec's table, not oversights:
--   1. The Amex "ACH Pmt|Retry Pymt" pattern can't tell Blue Business Plus
--      (2010) from Blue Business Cash (2020) apart by regex alone — the
--      spec's own table says "target: 2010/2020 by Ind ID", i.e. a human
--      needs to look at the real descriptor. Seeded as template='inbox'
--      instead of guessing which card.
--   2. LiftFund's loan *payment* needs an amortization split (principal vs.
--      interest) that doesn't exist until Phase 4's loans register, so it's
--      seeded as 'inbox' rather than 'loan_payment' for now. Loan *proceeds*
--      (funding, not a payment) doesn't need the schedule and is seeded
--      normally.
--   3. "Online Transfer To Main" and cash deposits are seeded exactly as
--      the spec marks them: template='inbox', because the spec explicitly
--      says these need a human decision (§11), not a guess.

INSERT INTO categorization_rules (priority, match_field, match_regex, direction, template, target_account_id) VALUES
  -- Card payoffs (10)
  (10, 'name', 'Payment To Chase Card', 'debit', 'card_payoff', (SELECT id FROM accounts WHERE code = '2000')),
  (10, 'name', 'Chase Credit Crd.*Autopay', 'debit', 'card_payoff', (SELECT id FROM accounts WHERE code = '2000')),
  (10, 'name', 'American Express.*(ACH Pmt|Retry Pymt)', 'debit', 'inbox', NULL),
  (10, 'name', 'U\.S\. Bank.*(Web Pymt|Cardmember Serv)', 'debit', 'card_payoff', (SELECT id FROM accounts WHERE code = '2030')),

  -- Square/Stripe payouts landing in checking (20)
  (20, 'name', 'Square Inc.*Sq26', 'credit', 'transfer', (SELECT id FROM accounts WHERE code = '1100')),
  (20, 'name', 'Stripe.*Transfer', 'credit', 'transfer', (SELECT id FROM accounts WHERE code = '1110')),
  (20, 'name', 'Real Time Transfer.*From: Square', 'credit', 'transfer', (SELECT id FROM accounts WHERE code = '1100')),

  -- Payroll clearing (25)
  (25, 'name', 'Square Inc.*Payroll', 'debit', 'payroll_clearing', NULL),
  (25, 'name', 'Irs.*Usataxpymt', 'debit', 'payroll_clearing', NULL),
  (25, 'name', 'Gusto.*Descr:(Net|Tax)', 'debit', 'payroll_clearing', NULL),
  (25, 'name', 'Gusto.*Descr:Fee', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6600')),

  -- Loans (30) — see deviation #2 above
  (30, 'name', 'Liftfund.*Loan Pmt', 'debit', 'inbox', NULL),
  (30, 'name', 'Liftfund.*ACH Fund', 'credit', 'loan_proceeds', (SELECT id FROM accounts WHERE code = '2500')),
  (30, 'name', 'Sq CAP', 'credit', 'loan_proceeds', (SELECT id FROM accounts WHERE code = '2510')),

  -- Tax, owner contribution, and the two explicitly-ambiguous patterns (40)
  (40, 'name', 'Utah801|Utah State Tax', 'debit', 'sales_tax_remit', NULL),
  (40, 'name', 'Samuel Robertson.*Funds Trans', 'credit', 'owner_contribution', NULL),
  (40, 'name', 'Online Transfer.*To Main', 'debit', 'inbox', NULL),
  (40, 'name', 'Deposit \d+|Cash Deposit', 'credit', 'inbox', NULL),

  -- Recurring vendors (50)
  (50, 'name', 'Upparkway', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6100')),
  (50, 'name', 'Walker Center', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6100')),
  (50, 'name', 'Rockymtn|Rocky Mtn Power|City of Orem.*UTIL', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6400')),
  (50, 'name', 'HISCOX', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6700')),
  (50, 'name', 'FACEBK|Local Impact|BYU COUGAR|Compass Billboards', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6200')),
  (50, 'name', 'ALIBABA|AL AMIR|Woodpeckers|VANDLEATHER|Costco', 'debit', 'cogs', NULL),
  (50, 'name', 'Wasatch Chb', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6800')),
  (50, 'name', 'LINKEDIN JOB|INDEED', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6800')),
  (50, 'name', 'Square.*subscription|GOOGLE.*WORKSPACE|KLAVIYO|BUFFER|CLEVERWAIVER|AWS|ASANA|ANTHROPIC|CLAUDE', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6600')),
  (50, 'name', 'Interest Charge', NULL, 'card_interest', NULL),
  (50, 'name', 'Monthly Service Fee|ACH .*Fee|Overdraft Fee|Wire Fee|Late Fee', NULL, 'expense', (SELECT id FROM accounts WHERE code = '6900')),
  (50, 'name', 'MAVERIK|CHEVRON|SHELL|CLEGG''S CAR CARE', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6950')),

  -- Catch-all retail/supplies (60)
  (60, 'name', 'AMAZON|WAL-MART|WALMART|HOME DEPOT|LOWE''S|Office Depot', 'debit', 'expense', (SELECT id FROM accounts WHERE code = '6500'));

-- Note: §6's priority-90 "any debit >= $1,000 at a non-COGS merchant ->
-- inbox with capex suggestion" is implemented as a UI hint in the inbox
-- (app/api/admin/accounting/inbox/route.ts), not a categorization_rules row
-- — it isn't a categorization decision, it's a flag on whatever's already
-- unreviewed.
