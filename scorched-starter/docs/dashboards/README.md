# Reporting dashboard (Claude artifact)

Source for the published dashboard that replaced `/admin/reporting` on 2026-10-12. It
started as two artifacts (Financials and Operations) and became one page with two
sections on 2026-10-26.

- Dashboard: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (shared by public link)

The artifact is one page (`reports.html`) plus four files published alongside it:
`shared.css` and `shared.js` (chrome, data layer, charts), `financials.js` (P&L, monthly
P&L, costs, balance sheet, cash flow, projections, normalized EBITDA) and `operations.js`
(overview, marketing, website, capacity, Square sales). Plain HTML and vanilla JS with
Chart.js 4.4.1 from cdnjs. Each section file registers itself on `window.Scorched.modules`
with its tabs and callbacks; `reports.html` mounts one shell carrying both sections and a
Financials | Operations switch where the title used to be. Tab ids are unique across the two
sections, so a deep link is still just `#costs` or `#website`.

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

The Overview tab's "Insights" card is a short note Claude writes during each refresh from
`data/snap/facts.json` (comparisons the script computes) into `data/snap/insights.json`,
which sits outside the manifest; the page fetches it directly and shows a placeholder when
it is missing. The refresh-dashboards skill and the routine prompt carry the writing rules.

With no data files present (a local preview served from this folder) the same page falls
back to real API calls with a sign-in card; set the API address under "Sign-in settings"
to `http://localhost:3000` to test against a dev server. To preview the published layout
instead, serve a folder containing `reports.html` as `index.html`, the four script and
style files, and a `data/` link to `.dashboard-snapshot/data`.

## Changing the page

Edit the files here, then republish `reports.html` to the same artifact URL with the four
supporting files attached. The link the admin nav uses lives in `lib/dashboards.ts`.
Projection model months and normalized EBITDA adjustments are entered in the app at
`/admin/reporting/inputs`.
