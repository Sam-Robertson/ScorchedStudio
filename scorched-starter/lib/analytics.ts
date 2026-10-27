// lib/analytics.ts — client-only conversion tracking. One call per business
// event fires both Google Analytics and the Meta pixel, so the two properties
// never disagree about what counts as a conversion. Both scripts are gated on
// their NEXT_PUBLIC_ id in app/layout.tsx; with neither set, every call here
// is a no-op.
//
// GA event names below are the ones to mark as key events in the GA admin
// (Admin, Events, toggle "Mark as key event"); `purchase` is a key event by
// default. The daily dashboard snapshot reads the same names back out.
"use client";

import { fbqTrack } from "@/lib/fbq";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA_KEY_EVENTS = [
  "booking_confirmed",
  "course_enrolled",
  "membership_started",
  "contact_submitted",
  "job_application",
  "newsletter_signup",
] as const;

// Same retry as fbqTrack: on a fresh success-page load the effect that calls
// this can run before the gtag script has defined window.gtag.
export function gaEvent(name: string, params?: Record<string, unknown>, attemptsLeft = 20) {
  if (typeof window === "undefined") return;
  if (window.gtag) {
    window.gtag("event", name, params);
    return;
  }
  if (attemptsLeft <= 0) return;
  setTimeout(() => gaEvent(name, params, attemptsLeft - 1), 150);
}

// A success page reloaded or revisited in the same tab must not count twice.
// sessionStorage can be unavailable (private mode, blocked storage); then the
// event simply fires each time, which is the pre-existing behavior.
function once(key: string, fire: () => void) {
  const k = "scorched:conv:" + key;
  try {
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch {}
  fire();
}

const dollars = (cents: number) => Math.round(cents) / 100;

export function trackBookingConfirmed(p: {
  bookingId: string;
  valueCents: number; // collected online, 0 for a reservation
  expectedCents: number; // what the visit is worth once the studio fee is collected
  partySize: number;
  paymentMethod: string | null;
  location: string;
}) {
  once(`booking:${p.bookingId}`, () => {
    const paidOnline = p.valueCents > 0;
    const value = dollars(paidOnline ? p.valueCents : p.expectedCents);
    gaEvent("booking_confirmed", {
      transaction_id: p.bookingId,
      value,
      currency: "USD",
      party_size: p.partySize,
      payment_method: p.paymentMethod ?? "pay_in_studio",
      paid_online: paidOnline,
      studio: p.location,
    });
    if (paidOnline) {
      gaEvent("purchase", {
        transaction_id: p.bookingId,
        value,
        currency: "USD",
        items: [
          {
            item_id: "studio-booking",
            item_name: "Studio booking",
            item_category: "booking",
            price: dollars(p.valueCents / p.partySize),
            quantity: p.partySize,
          },
        ],
      });
    }
    // Meta's standard event for a reservation; Purchase as well when paid.
    const meta = { content_name: "Studio booking", content_category: "booking", value, currency: "USD", num_items: p.partySize };
    fbqTrack("Schedule", meta);
    if (paidOnline) fbqTrack("Purchase", meta);
  });
}

export function trackCourseEnrolled(p: { sessionId: string; valueCents: number; courseName: string }) {
  once(`course:${p.sessionId}`, () => {
    const value = dollars(p.valueCents);
    const item = { item_id: p.courseName, item_name: p.courseName, item_category: "course", price: value, quantity: 1 };
    gaEvent("course_enrolled", { transaction_id: p.sessionId, value, currency: "USD", course: p.courseName });
    gaEvent("purchase", { transaction_id: p.sessionId, value, currency: "USD", items: [item] });
    fbqTrack("Purchase", { content_name: p.courseName, content_category: "course", value, currency: "USD" });
  });
}

export function trackMembershipCheckoutStart(p: { planKey: string; interval: string; valueCents: number }) {
  const value = dollars(p.valueCents);
  gaEvent("begin_checkout", {
    value,
    currency: "USD",
    items: [{ item_id: `${p.planKey}-${p.interval}`, item_name: p.planKey, item_category: "membership", price: value, quantity: 1 }],
  });
  fbqTrack("InitiateCheckout", {
    content_name: p.planKey,
    content_category: "membership",
    contents: [{ id: `${p.planKey}-${p.interval}` }],
    value,
    currency: "USD",
  });
}

export function trackMembershipStarted(p: { sessionId: string; valueCents: number; planName: string }) {
  once(`membership:${p.sessionId}`, () => {
    const value = dollars(p.valueCents);
    const item = { item_id: p.planName, item_name: p.planName, item_category: "membership", price: value, quantity: 1 };
    gaEvent("membership_started", { transaction_id: p.sessionId, value, currency: "USD", plan: p.planName });
    gaEvent("purchase", { transaction_id: p.sessionId, value, currency: "USD", items: [item] });
    fbqTrack("Purchase", { content_name: p.planName, content_category: "membership", value, currency: "USD" });
  });
}

export function trackContactSubmitted(p: { studio?: string; source: string }) {
  gaEvent("contact_submitted", { studio: p.studio ?? "(none)", form: p.source });
  fbqTrack("Lead", { content_name: p.source, content_category: "contact" });
}

export function trackJobApplication(p: { jobTitle: string }) {
  gaEvent("job_application", { job_title: p.jobTitle });
  fbqTrack("SubmitApplication", { content_name: p.jobTitle });
}

export function trackNewsletterSignup() {
  gaEvent("newsletter_signup");
  fbqTrack("Subscribe", { content_name: "newsletter" });
}
