---
name: refresh-dashboards
description: Push fresh report data into the two Claude dashboards (Financials and Operations). Use when Sam asks to refresh, update or reload the dashboards, or says the dashboard numbers are stale.
---

# Refresh the reporting dashboards

The dashboards are published artifacts that read a snapshot from their own
artifact database (they cannot call the app's API from inside claude.ai).
Refreshing them is two steps: build the snapshot, then write it with the
ArtifactData tool.

Artifacts:
- Financials: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r
- Operations: https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd

## 1. Build the snapshot

From `scorched-starter/` (needs `ADMIN_PASSWORD` in `.env`; pulls from production
by default, set `DASHBOARD_API_BASE=http://localhost:3000` to use a dev server):

```
npx tsx scripts/dashboard-snapshot.ts
```

It writes `.dashboard-snapshot/manifest.json` plus one JSON file per document
under `.dashboard-snapshot/financials/` and `.dashboard-snapshot/operations/`.
Read the manifest; each entry has `artifact`, `collection`, `doc_id`, `file`.

## 2. Write the documents

For each artifact, one `ArtifactData` call with `action: "batch"` and the
artifact's `url`, listing every manifest entry for that artifact as
`{op: "set", collection, doc_id, file_path: <absolute path to file>}`.

Documents that already exist need `if_version`. Get current versions with
`ArtifactData` `action: "list"` on each collection (`snap`, `journal` for
Financials; `snap`, `bookings` for Operations) and pass each document's
`version` as `if_version` on its entry. A new month (a new `journal/<YYYY-MM>`
or `bookings/<YYYY-MM>` document) has no version yet and is created without one.

A batch holds at most 50 writes and 1 MiB; Financials is about 25 documents
and 400 KiB, Operations about 15 documents and 250 KiB, so one batch each.

## 3. Confirm

Open either dashboard: the top right shows "Data as of <time>" from the new
`snap/meta` document. Nothing else needs republishing.

## Automatic refresh

A cloud routine named "Refresh Scorched dashboards" (id trig_019ahGHduhcsrqiWNZz2x7Bv,
https://claude.ai/code/routines/trig_019ahGHduhcsrqiWNZz2x7Bv) runs these same steps
daily at 12:00 UTC (6:00 AM Denver in summer, 5:00 AM in winter). It downloads the
script from the public repo and signs in with the ADMIN_PASSWORD variable set on the
Default cloud environment at claude.ai/code. To check on it, use RemoteTrigger
`list_runs` then `get_run_log`. Running this skill by hand is still fine between runs.

## Notes

- Projection model months and normalized EBITDA adjustments are entered in the
  app at Admin, Reporting, Report inputs; they reach the dashboard on the next
  refresh.
- If a journal month hits the API's 500-entry cap the script warns; drill-downs
  for that month are incomplete until the journal route pages.
- To change the pages themselves, edit `scorched-starter/docs/dashboards/` and
  republish with the Artifact tool to the same URL, attaching `shared.css` and
  `shared.js` as files and `capabilities: {db: {}}`.
