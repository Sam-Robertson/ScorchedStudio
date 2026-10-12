// The reporting dashboards are published Claude artifacts that read live data
// from this app's admin API (see DASHBOARD_API_ROUTES in next.config.ts for
// the routes they call). They replaced the in-app /admin/reporting pages on
// 2026-10-12. Update these when a dashboard is republished to a new link.
export const DASHBOARDS = [
  {
    key: "financials",
    label: "Financials",
    blurb: "P&L, monthly P&L, costs, balance sheet, cash flow, projections, normalized EBITDA.",
    url: "https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r",
  },
  {
    key: "operations",
    label: "Operations",
    blurb: "Overview, marketing spend and channels, capacity and repeat customers, Square sales.",
    url: "https://claude.ai/artifact/VJu3gkKX5F32BxEcQCoSLd",
  },
] as const;
