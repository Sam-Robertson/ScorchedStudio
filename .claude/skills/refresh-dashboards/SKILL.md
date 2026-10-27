---
name: refresh-dashboards
description: Push fresh report data into the Claude reporting dashboard (Financials and Operations sections). Use when Sam asks to refresh, update or reload the dashboard, or says the dashboard numbers are stale.
---

# Refresh the reporting dashboard

The dashboard is a published artifact whose page reads a data snapshot from JSON files
published next to it (`data/manifest.json` plus `data/<collection>/<id>.json`).
Published files load for anyone who can open the page, signed in or not, which is
what lets the public link work for staff. Refreshing is two steps: build the
snapshot, then republish the data files with the Artifact tool.

Artifact: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (public link; one page with a
Financials and an Operations section. Until 2026-10-26 Operations was a separate artifact,
since deleted.)

## 1. Build the snapshot

From `scorched-starter/` (needs `ADMIN_PASSWORD` in `.env`; pulls from production
by default, set `DASHBOARD_API_BASE=http://localhost:3000` to use a dev server):

```
node scripts/dashboard-snapshot.mjs
```

It writes `.dashboard-snapshot/data/manifest.json` plus one JSON file per document
under `.dashboard-snapshot/data/`, and a top-level `.dashboard-snapshot/manifest.json`
for tooling.

The snapshot also carries Google Analytics traffic (`web/*` documents and
`snap/web-meta`) when `GA_PROPERTY_ID` and `GA_SERVICE_ACCOUNT_JSON` are set in `.env`.
The script's last output line says whether GA was read or why not; a GA problem never
fails the rest of the snapshot, the Website tab just shows the reason.

## 1b. Write the insights

The Overview tab opens with an "Insights" card that Claude writes at refresh time. Read
`.dashboard-snapshot/data/snap/facts.json` (week-over-week and month-over-month comparisons
the script computed: Square sales, ledger months, bookings, sources, returning customers,
and website traffic when GA is connected) and write
`.dashboard-snapshot/data/snap/insights.json`:

```
{"asOf": "<facts.asOf>", "generatedAt": "<ISO now>", "items": [{"title", "body", "tone", "tab"}, ...]}
```

4 to 7 items, biggest move first. `title` under 9 words stating the finding; `body` one to
three sentences under 50 words quoting the facts' numbers (rounded, with $ or %) and
saying which windows; `tone` is good, bad, warn (something to check, such as a ledger line
that looks miscoded or a comparison that is not apples to apples) or neutral; `tab` is one
of pl, monthly, costs, balance, cashflow, projections, overview, marketing, website,
capacity, sales. Always cover bookings and, when `facts.web` exists, the website. Treat
`seats.next7` as what is booked so far, not a drop. Never invent causes: connect two facts
only when both are in the file. Plain language, no em dashes. The file is outside the
manifest; add it to the publish map by hand.

## 2. Republish the data files

One `Artifact` publish with `url` set to the artifact, `file_path` the page
(`docs/dashboards/reports.html`), `root` the snapshot folder
(`scorched-starter/.dashboard-snapshot`), and `files` mapping every path in
`data/manifest.json` to itself, plus `data/manifest.json` and
`data/snap/insights.json`. Leave out `capabilities`
and `icon`; files not mentioned (`shared.css`, `shared.js`, `financials.js`,
`operations.js`) are kept. If the session has not read or published the artifact yet,
`Artifact` action `read` with the url first (and `list` with scope `files` so the
existing paths count as seen).

## 3. Confirm

Open the dashboard: the top right shows "Data as of <time>" from the new
`data/snap/meta.json`.

## Automatic refresh

A cloud routine named "Refresh Scorched dashboards" (id trig_019ahGHduhcsrqiWNZz2x7Bv,
https://claude.ai/code/routines/trig_019ahGHduhcsrqiWNZz2x7Bv) runs these same steps
daily at 12:00 UTC (6:00 AM Denver in summer, 5:00 AM in winter). The sandbox cannot reach
GitHub, so the routine downloads `scripts/dashboard-snapshot.mjs` from the artifact itself,
where it is published as the file `dashboard-snapshot.mjs`, and only runs it if its sha256
matches the hash written in the routine prompt. After changing the script: republish it to
the artifact (`files: {"dashboard-snapshot.mjs": {"from": "scripts/dashboard-snapshot.mjs",
"contentType": "text/javascript"}}`), then put `shasum -a 256` of the file into the prompt
(RemoteTrigger `update` with the prompt in the body). It signs
in with the ADMIN_PASSWORD variable set on the Default cloud environment at claude.ai/code,
whose network access must allow www.scorchedstudio.com (and, for Google Analytics,
oauth2.googleapis.com and analyticsdata.googleapis.com with GA_PROPERTY_ID and
GA_SERVICE_ACCOUNT_JSON set as variables). To check on it, use RemoteTrigger `list_runs`
then `get_run_log`. Running this skill by hand is still fine between runs.

## Notes

- Projection model months and normalized EBITDA adjustments are entered in the
  app at Admin, Reporting, Report inputs; they reach the dashboard on the next
  refresh.
- If a journal month hits the API's 500-entry cap the script warns; drill-downs
  for that month are incomplete until the journal route pages.
- To change the page itself, edit `scorched-starter/docs/dashboards/` and
  republish with the Artifact tool to the same URL, attaching `shared.css`,
  `shared.js`, `financials.js` and `operations.js` as files (the data files already
  published are kept).
