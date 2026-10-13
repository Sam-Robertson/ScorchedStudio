# Reporting dashboards (Claude artifacts)

Source for the two published dashboards that replaced `/admin/reporting` on 2026-10-12.

- Financials: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (shared by public link)
- Operations: https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd

Each artifact is one page (`financials.html` or `operations.html`) plus the two shared
files published alongside it (`shared.css`, `shared.js`): plain HTML and vanilla JS with
Chart.js 4.4.1 from cdnjs.

## Where the data comes from

The artifact viewer blocks network requests, so the pages cannot call this app's API.
Instead the report data is published next to each page as JSON files
(`data/manifest.json` and `data/<collection>/<id>.json`), and the page answers its usual
report requests from them (`snap.resolve` in `shared.js` reproduces the P&L, costs,
sales, bookings and journal routes client-side). Published files load for anyone who can
open the page, signed in to Claude or not. `scripts/dashboard-snapshot.mjs` builds the
files from the API; a daily cloud routine republishes them, and the `refresh-dashboards`
skill in the repo root's `.claude/skills/` describes the manual procedure. The top right
of each dashboard shows when its data was taken.

With no data files present (a local preview served from this folder) the same pages fall
back to real API calls with a sign-in card; set the API address under "Sign-in settings"
to `http://localhost:3000` to test against a dev server. To preview the published layout
instead, serve a folder containing the page as `index.html`, the two shared files and a
`data/` link to `.dashboard-snapshot/<artifact>/data`.

## Changing a page

Edit the files here, then republish the page to the same artifact URL with both shared
files attached. The links the admin nav uses live in `lib/dashboards.ts`. Projection
model months and normalized EBITDA adjustments are entered in the app at
`/admin/reporting/inputs`.
