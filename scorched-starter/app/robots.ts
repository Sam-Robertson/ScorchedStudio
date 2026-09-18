// app/robots.ts
//
// There was no robots.txt at all, which meant the rules were whatever a crawler
// assumed. Being explicit matters here: A2P 10DLC reviewers fetch /privacy and
// /terms, and a future blanket disallow added for the admin area could quietly
// take those with it and stall a campaign registration.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin area needs a login anyway; this just keeps it out of search
        // results. Nothing here blocks the legal pages.
        disallow: ["/admin", "/api/"],
      },
    ],
  };
}
