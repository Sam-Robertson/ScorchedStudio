import type { NextConfig } from "next";

// The reporting dashboards live on claude.ai as published artifacts and call
// these routes cross-origin with the same signed admin bearer token the
// in-app admin uses. CORS does not protect a bearer-token API (an unauthenticated
// caller still gets 401), so the allow-list is only as wide as the dashboards
// need: the login route, the session check, and the read-mostly report data.
// The artifact origin is per-page and not known ahead of time, hence "*".
const DASHBOARD_API_ROUTES = [
  "/api/admin/verify",
  "/api/admin/session",
  "/api/admin/bookings",
  "/api/admin/accounting/reports/:path*",
  "/api/admin/accounting/journal-entries",
  "/api/admin/accounting/projections",
];

const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
  { key: "Access-Control-Max-Age", value: "86400" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The web fonts the marketing emails reference.
        //
        // A mail client fetches these from a document that is not on this
        // origin, and so does the editor's preview, which renders in a
        // sandboxed iframe with an opaque origin. Fonts are subject to CORS
        // even when stylesheets and images are not, so without this header
        // they silently fail to load and everything falls back.
        source: "/email/fonts/:file*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          // Immutable: a changed font gets a new filename from the build
          // script rather than being edited in place.
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      ...DASHBOARD_API_ROUTES.map((source) => ({ source, headers: CORS_HEADERS })),
    ];
  },
};

export default nextConfig;
