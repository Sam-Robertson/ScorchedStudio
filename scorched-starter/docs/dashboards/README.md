# Reporting dashboard (Claude artifact)

Source for the published dashboard that replaced `/admin/reporting` on 2026-10-12. It
started as two artifacts (Financials and Operations), became one page with two sections on
2026-10-26, and was regrouped the next day into five groups: Home, Money, Customers, Sales
and Plan.

- Dashboard: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (shared by public link)

The artifact is one page (`reports.html`) plus five files published alongside it:
`shared.css` and `shared.js` (chrome, data layer, charts), `home.js` (the Home tab),
`financials.js` (Money: P&L, monthly P&L, costs, cash and balance; Plan: targets,
normalized EBITDA) and `operations.js` (Customers: bookings and capacity, marketing,
website; Sales: Square sales and products). Plain HTML and vanilla JS with Chart.js 4.4.1
from cdnjs. Each module registers itself on `window.Scorched.modules` with its tabs, each
tab naming its group; `reports.html` mounts one shell carrying all of them with the group
switch (Home | Money | Customers | Sales | Plan) where the title used to be. A group with a
single tab (Home, Sales) shows no tab row. Tab ids are unique across groups, so a deep link
is still just `#costs` or `#website`; retired ids (`#overview`, `#capacity`, `#balance`,
`#cashflow`, `#projections`) are aliased to their replacements.

## Where the data comes from

The artifact viewer blocks network requests, so the page cannot call this app's API.
Instead the report data is published next to it as JSON files (`data/manifest.json` and
`data/<collection>/<id>.json`), and the page answers its usual report requests from them
(`snap.resolve` in `shared.js` reproduces the P&L, costs, sales, bookings and journal
routes client-side). Published files load for anyone who can open the page, signed in to
Claude or not. `scripts/dashboard-snapshot.mjs` builds the files from the API into
`.dashboard-snapshot/data/`; a daily cloud routine republishes them, and the
`refresh-dashboards` skill in the repo root's `.claude/skills/` describes the manual
procedure. The top right of the dashboard shows when its data was taken.

The Website tab reads Google Analytics documents the same script pulls from the GA Data
API (`web/*` plus `snap/web-meta`). That needs `GA_PROPERTY_ID` and
`GA_SERVICE_ACCOUNT_JSON` (a service account with Viewer on the GA4 property) wherever the
script runs; without them the tab explains it is not connected and the rest refreshes as
usual. The events it counts are the ones `lib/analytics.ts` sends from the site.

Home reads `data/snap/facts.json`, the comparisons the script computes (last 7 and 28 days
against the periods before, the last two ledger months, bookings, sources, returning
customers, website traffic, the month against its target, seats by weekday and time slot,
booking lead time, a six-month trend and cash on hand). Its "Insights" card is what Claude
writes during each refresh from that same file into `data/snap/insights.json`, which sits
outside the manifest; the page fetches it directly and shows a placeholder when it is
missing. Each insight carries a finding, the likely reason, one action and what to watch
(`{title, body, why, action, watch, kind, tone, tab}`; older files without the extra
fields still render). The refresh-dashboards skill and the routine prompt carry the
writing rules.

The Plan group's Targets tab paces the month against the revenue and profit targets
entered in the app at `/admin/reporting/inputs` (the `projection_months` table). Actuals
come from the P&L document so the in-progress month is compared too.

With no data files present (a local preview served from this folder) the same page falls
back to real API calls with a sign-in card; set the API address under "Sign-in settings"
to `http://localhost:3000` to test against a dev server. To preview the published layout
instead, serve a folder containing `reports.html` as `index.html`, the five script and
style files, and a `data/` link to `.dashboard-snapshot/data`.

## Changing the page

Edit the files here, then republish `reports.html` to the same artifact URL with the five
supporting files attached. The link the admin nav uses lives in `lib/dashboards.ts`.
Monthly targets and normalized EBITDA adjustments are entered in the app at
`/admin/reporting/inputs`.
