// The reporting dashboard is a published Claude artifact. It cannot call this
// app directly (claude.ai blocks network requests from artifacts), so it reads
// a snapshot of the admin API data that Claude publishes next to the page on a
// schedule. It replaced the in-app /admin/reporting pages on 2026-10-12 as two
// artifacts (Financials and Operations), merged into one page on 2026-10-26
// and regrouped into Home, Money, Customers, Sales and Plan the next day.
// Update this when the dashboard is republished to a new link.
export const DASHBOARDS = [
  {
    key: "reports",
    label: "Dashboard",
    blurb: "Home: this week and Claude's insights. Money: P&L, costs, cash and balance. Customers: bookings, marketing, website. Sales: Square. Plan: targets.",
    url: "https://claude.ai/artifact/Fm3coEiirc481Tiu3gxW8r",
  },
] as const;
