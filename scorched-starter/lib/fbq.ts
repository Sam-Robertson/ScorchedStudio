// lib/fbq.ts — client-only helpers for firing Meta Pixel events.
// Safe to call from any client component; no-ops if the pixel script hasn't
// loaded yet (e.g. fired a moment before afterInteractive finishes).
"use client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Retries briefly in case this fires before the afterInteractive pixel script
// has attached window.fbq (most likely right after a fresh success-page load).
export function fbqTrack(event: string, params?: Record<string, unknown>, attemptsLeft = 20) {
  if (typeof window === "undefined") return;
  if (window.fbq) {
    window.fbq("track", event, params);
    return;
  }
  if (attemptsLeft <= 0) return;
  setTimeout(() => fbqTrack(event, params, attemptsLeft - 1), 150);
}

export function trackInitiateCheckout(params: { planKey: string; interval: string; valueCents: number }) {
  fbqTrack("InitiateCheckout", {
    content_name: params.planKey,
    content_category: "membership",
    contents: [{ id: `${params.planKey}-${params.interval}` }],
    value: params.valueCents / 100,
    currency: "USD",
  });
}

export function trackPurchase(params: { valueCents: number; contentName: string }) {
  fbqTrack("Purchase", {
    content_name: params.contentName,
    content_category: "membership",
    value: params.valueCents / 100,
    currency: "USD",
  });
}
