// The reporting dashboard is a published Claude artifact. It cannot call this
// app directly (claude.ai blocks network requests from artifacts), so it reads
// a snapshot of the admin API data that Claude publishes next to the page on a
// schedule. It replaced the in-app /admin/reporting pages on 2026-10-12 as two
// artifacts (Financials and Operations), merged into one page with two
// sections on 2026-10-26. Update this when the dashboard is republished to a
// new link.
export const DASHBOARDS = [
  {
    key: "reports",
    label: "Dashboard",
    blurb: "Financials: P&L, costs, balance sheet, cash flow, projections. Operations: marketing, website, capacity, Square sales.",
    url: "https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r",
  },
] as const;
