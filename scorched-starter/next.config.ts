import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
