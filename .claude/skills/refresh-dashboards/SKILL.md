---
name: refresh-dashboards
description: Push fresh report data into the Claude reporting dashboard (Home, Money, Customers, Sales, Plan) and write the day's insights. Use when Sam asks to refresh, update or reload the dashboard, or says the dashboard numbers are stale.
---

# Refresh the reporting dashboard

The dashboard is a published artifact whose page reads a data snapshot from JSON files
published next to it (`data/manifest.json` plus `data/<collection>/<id>.json`).
Published files load for anyone who can open the page, signed in or not, which is
what lets the public link work for staff. Refreshing is two steps: build the
snapshot, then republish the data files with the Artifact tool.

Artifact: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (public link; one page with
Home, Money, Customers, Sales and Plan groups. Until 2026-10-26 Operations was a separate
artifact, since deleted.)

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

The Home tab opens with an "Insights" card that Claude writes at refresh time. Read
`.dashboard-snapshot/data/snap/facts.json` (what the script computed: Square sales and
ledger months, bookings, sources, returning customers, website traffic when GA is
connected, the month against its target under `targets`, seats by weekday and time slot
and booking lead time under `capacity`, a six-month `trend`, and `cash`) and, if the
artifact already has one, the previous `data/snap/insights.json` (Artifact read with
`path`), then write `.dashboard-snapshot/data/snap/insights.json`:

```
{"asOf": "<facts.asOf>", "generatedAt": "<ISO now>",
 "items": [{"kind", "title", "body", "why", "action", "watch", "tone", "tab"}, ...]}
```

4 to 6 items, the one that matters most first. Each item is a finding with a reason and a
move, not a chart caption:

- `kind`: `act` (a move to make this week), `why` (what is behind a change), `check`
  (something that looks wrong: a miscoded ledger line, a tracking gap, a spike in
  cancellations), `target` (the month against its target; include one whenever
  `facts.targets` is not null, and when it is null, one `target` item saying so and
  suggesting a first target from `trend`), `good` (something working, worth keeping).
  At least one `act`, and one `check` whenever anything in the facts looks off.
- `title`: under 9 words, states the finding, not the topic.
- `body`: one to three sentences under 50 words, with the numbers from the facts (rounded,
  with $ or %) and the windows they cover.
- `why`: the most likely explanation, built only from facts that are in the file (for
  example sessions fell while Paid Social went to zero and ledger marketing went to $0),
  worded as a reading ("most likely", "lines up with"), never as a certainty. Leave it out
  when the facts do not support one.
- `action`: one specific move sized for a small studio, with the number it is aimed at:
  which weekday or slot to promote (the low ones in `capacity`), whether to restart a
  channel and at roughly what spend (the ledger's past marketing line), who to message
  (returning customers, a cohort), what ledger cell to open. Not "consider" or
  "monitor". For `good` items it may be omitted.
- `watch`: the number that should move if the action works, and by when (next week's
  facts, next month's ledger).
- `tone`: good, bad, warn or neutral (the dot colour); `tab`: where to see it, one of
  home, pl, monthly, costs, cash, bookings, marketing, website, sales, plan, normalized.

Always cover bookings and, when `facts.web` exists, the website. Treat `seats.next7` as
what is booked so far, not a drop. When yesterday's file had an `act` item whose action is
still the right call, keep it with today's numbers and say how many days it has been
open; drop it once the `watch` number has moved. Never invent a number or a cause. Plain
language, no jargon, no em dashes. The file is outside the manifest; add it to the publish
map by hand.

## 2. Republish the data files

One `Artifact` publish with `url` set to the artifact, `file_path` the page
(`docs/dashboards/reports.html`), `root` the snapshot folder
(`scorched-starter/.dashboard-snapshot`), and `files` mapping every path in
`data/manifest.json` to itself, plus `data/manifest.json` and
`data/snap/insights.json`. Leave out `capabilities`
and `icon`; files not mentioned (`shared.css`, `shared.js`, `home.js`, `financials.js`,
`operations.js`, `dashboard-snapshot.mjs`) are kept. If the session has not read or published the artifact yet,
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

- Monthly targets (the Plan group's Targets tab) and normalized EBITDA adjustments
  are entered in the app at Admin, Reporting, Report inputs; they reach the dashboard
  on the next refresh.
- If a journal month hits the API's 500-entry cap the script warns; drill-downs
  for that month are incomplete until the journal route pages.
- To change the page itself, edit `scorched-starter/docs/dashboards/` and
  republish with the Artifact tool to the same URL, attaching `shared.css`,
  `shared.js`, `home.js`, `financials.js` and `operations.js` as files (the data files
  already published are kept).
