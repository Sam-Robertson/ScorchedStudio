# Reporting dashboards (Claude artifacts)

Source for the two published dashboards that replaced `/admin/reporting` on 2026-10-12.

- Financials: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r
- Operations: https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd

Each artifact is one page (`financials.html` or `operations.html`) plus the two shared
files published alongside it (`shared.css`, `shared.js`): plain HTML and vanilla JS with
Chart.js 4.4.1 from cdnjs.

## Where the data comes from

The artifact viewer blocks network requests, so the pages cannot call this app's API.
Instead each artifact has its own database (the `db` capability) holding a snapshot of
the report data, and the page answers its usual report requests from that snapshot
(`snap.resolve` in `shared.js` reproduces the P&L, costs, sales, bookings and journal
routes client-side). `scripts/dashboard-snapshot.mjs` builds the snapshot from the API;
Claude writes it into the artifacts with the ArtifactData tool. The procedure is the
`refresh-dashboards` skill in the repo root's `.claude/skills/`. The top right of each
dashboard shows when its data was taken.

Outside claude.ai (a local preview served from this folder) the same pages fall back to
real API calls with a sign-in card; set the API address under "Sign-in settings" to
`http://localhost:3000` to test against a dev server.

## Changing a page

Edit the files here, then republish the page to the same artifact URL with both shared
files attached and `capabilities: {db: {}}`. The links the admin nav uses live in
`lib/dashboards.ts`. Projection model months and normalized EBITDA adjustments are
entered in the app at `/admin/reporting/inputs`.
