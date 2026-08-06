"use client";

import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/fbq";

export default function PurchasePixel({
  valueCents,
  contentName,
}: {
  valueCents: number;
  contentName: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackPurchase({ valueCents, contentName });
  }, [valueCents, contentName]);

  return null;
}
