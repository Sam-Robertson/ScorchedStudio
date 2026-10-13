---
name: refresh-dashboards
description: Push fresh report data into the two Claude dashboards (Financials and Operations). Use when Sam asks to refresh, update or reload the dashboards, or says the dashboard numbers are stale.
---

# Refresh the reporting dashboards

The dashboards are published artifacts whose pages read a data snapshot from JSON
files published next to them (`data/manifest.json` plus `data/<collection>/<id>.json`).
Published files load for anyone who can open the page, signed in or not, which is
what lets the public link work for staff. Refreshing is two steps: build the
snapshot, then republish the data files with the Artifact tool.

Artifacts:
- Financials: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r (public link)
- Operations: https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd

## 1. Build the snapshot

From `scorched-starter/` (needs `ADMIN_PASSWORD` in `.env`; pulls from production
by default, set `DASHBOARD_API_BASE=http://localhost:3000` to use a dev server):

```
node scripts/dashboard-snapshot.mjs
```

It writes `.dashboard-snapshot/<artifact>/data/manifest.json` plus one JSON file per
document under each artifact's `data/` folder, and a top-level
`.dashboard-snapshot/manifest.json` for tooling.

## 2. Republish the data files

For each artifact, one `Artifact` publish with `url` set to the artifact, `file_path`
the page (`docs/dashboards/financials.html` or `operations.html`), `root` the
artifact's snapshot folder (`scorched-starter/.dashboard-snapshot/financials` or
`.../operations`), and `files` mapping every path in that artifact's
`data/manifest.json` to itself, plus `data/manifest.json`. Leave out `capabilities`
and `icon`; files not mentioned (`shared.css`, `shared.js`) are kept. If the session
has not read or published the artifact yet, `Artifact` action `read` with the url
first (and `list` with scope `files` so the existing paths count as seen).

## 3. Confirm

Open either dashboard: the top right shows "Data as of <time>" from the new
`data/snap/meta.json`.

## Automatic refresh

A cloud routine named "Refresh Scorched dashboards" (id trig_019ahGHduhcsrqiWNZz2x7Bv,
https://claude.ai/code/routines/trig_019ahGHduhcsrqiWNZz2x7Bv) runs these same steps
daily at 12:00 UTC (6:00 AM Denver in summer, 5:00 AM in winter). Its prompt carries a
verbatim copy of `scripts/dashboard-snapshot.mjs` (the sandbox cannot reach GitHub), so
when the script changes, update the routine prompt too (RemoteTrigger `update`). It signs
in with the ADMIN_PASSWORD variable set on the Default cloud environment at claude.ai/code,
whose network access must allow www.scorchedstudio.com. To check on it, use RemoteTrigger
`list_runs` then `get_run_log`. Running this skill by hand is still fine between runs.

## Notes

- Projection model months and normalized EBITDA adjustments are entered in the
  app at Admin, Reporting, Report inputs; they reach the dashboard on the next
  refresh.
- If a journal month hits the API's 500-entry cap the script warns; drill-downs
  for that month are incomplete until the journal route pages.
- To change the pages themselves, edit `scorched-starter/docs/dashboards/` and
  republish with the Artifact tool to the same URL, attaching `shared.css` and
  `shared.js` as files (the data files already published are kept).
