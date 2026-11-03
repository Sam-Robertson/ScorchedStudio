// components/AttributionCapture.tsx
// Remembers ad campaign parameters (utm_*, fbclid, ttclid, gclid) from the
// URL on first load and on every client-side route change, so the booking form
// can attach them. Renders nothing. See lib/attribution.ts.
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

export default function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAttribution();
  }, [pathname]);
  return null;
}
