# Reporting dashboards (Claude artifacts)

Source for the two published dashboards that replaced `/admin/reporting` on 2026-10-12.

- Financials: https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r
- Operations: https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd

Each artifact is one page (`financials.html` or `operations.html`) plus the two shared
files published alongside it (`shared.css`, `shared.js`). They are plain HTML and
vanilla JS with Chart.js 4.4.1 from cdnjs. Data comes live from this app's admin API
using the signed admin session token; the routes they may call cross-origin are listed
in `DASHBOARD_API_ROUTES` in `next.config.ts`.

To change a dashboard, edit the files here, then republish the page to the same artifact
URL with both shared files attached. The links the admin nav uses live in `lib/dashboards.ts`.

Local preview: serve this folder statically, open the page, and in the sign-in card's
"Sign-in settings" set the API address to `http://localhost:3000`.
