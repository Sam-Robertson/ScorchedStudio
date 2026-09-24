# September 2026 reporting audit: fixes awaiting approval

Each script here changes existing ledger entries, which the audit was not
cleared to do on its own. Every script prints what it would do by default;
pass `--apply` to run it. Run from `scorched-starter/` with:

    npx tsx --tsconfig tsconfig.json scripts/audit-2026-09/<script>.ts [--apply]

1. `remove_liftfund_opening_duplicate.ts`: the LiftFund loan was recorded
   twice. A manual "opening entry" for $21,000 on 2026-04-01 (memo says it
   predates Plaid history) and the actual $20,000 ACH funding on 2026-04-02
   from the bank feed (history was extended back to June 2025 after the
   manual entry was made). Together they overstate checking by $21,000 and
   the loan by $21,000. Removing the manual entry leaves the bank-fed
   $20,000. If the loan agreement really is $21,000 with a $1,000 fee taken
   at funding, the fee still needs a $1,000 entry (Dr 6900 or 8000, Cr 2500).
2. `repost_card_reward_credits.ts`: six statement credits and cash rewards
   were posted with the `card_payoff` template against the card's own
   account, which debits and credits the same account and changes nothing.
   The card balances are overstated by $1,006.68 (Chase Ink) and $170.32
   (Amex Blue Business Cash), and expenses are overstated by the same. The
   script re-posts them as credits to 6900 Bank Fees & Misc, the way "Cash
   Rebate Statement Credit" is already handled, and repoints the three rules.
