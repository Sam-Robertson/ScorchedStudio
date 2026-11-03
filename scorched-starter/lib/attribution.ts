// lib/attribution.ts
// Paid-ad attribution for bookings. The browser remembers the most recent
// visit that arrived with campaign parameters (utm_* from an ad's URL, or a
// platform click id such as fbclid), and the booking form sends that along so
// the booking row can say whether an ad brought the customer. Self-reported
// "how did you hear about us" stays as it was; this is the measured version.
//
// Shared between the client (capture + read) and the API routes (validate +
// store), so the shape lives in one place. No window access at module level.

import { z } from "zod";

export const ATTRIBUTION_STORAGE_KEY = "scorched_attribution";
export const ATTRIBUTION_TTL_DAYS = 30;

// Click id query params that only appear on a paid click, by platform.
export const CLICK_ID_PARAMS: Record<string, string> = {
  fbclid: "meta",
  ttclid: "tiktok",
  gclid: "google",
  msclkid: "microsoft",
};

const short = z.string().trim().min(1).max(120);

export const attributionSchema = z.object({
  source: short.optional(),
  medium: short.optional(),
  campaign: short.optional(),
  content: short.optional(),
  click_id_kind: z.enum(["meta", "tiktok", "google", "microsoft"]).optional(),
  landing_path: z.string().trim().min(1).max(200).optional(),
  attributed_at: z.string().datetime().optional(),
});

export type Attribution = z.infer<typeof attributionSchema>;

// What the column set on bookings looks like (supabase-booking-attribution-setup.sql).
export type BookingAttributionColumns = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  click_id_kind: string | null;
  landing_path: string | null;
  attributed_at: string | null;
};

export function toBookingColumns(a: Attribution | null | undefined): BookingAttributionColumns | null {
  if (!a) return null;
  const cols: BookingAttributionColumns = {
    utm_source: a.source ?? null,
    utm_medium: a.medium ?? null,
    utm_campaign: a.campaign ?? null,
    utm_content: a.content ?? null,
    click_id_kind: a.click_id_kind ?? null,
    landing_path: a.landing_path ?? null,
    attributed_at: a.attributed_at ?? null,
  };
  const hasSignal = cols.utm_source || cols.utm_medium || cols.utm_campaign || cols.click_id_kind;
  return hasSignal ? cols : null;
}

// Stripe metadata values are strings capped at 500 characters; keep the
// attribution in one JSON value so the PaymentIntent carries it to the
// booking insert without taking seven metadata keys.
export function toMetadataString(a: Attribution | null | undefined): string {
  const cols = toBookingColumns(a);
  if (!cols) return "";
  const s = JSON.stringify(a);
  return s.length <= 500 ? s : "";
}

export function fromMetadataString(s: string | undefined | null): Attribution | null {
  if (!s) return null;
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(s));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// A booking counts as paid-ad driven when its medium says so or a platform
// click id was on the link. Meta's default URL parameters are utm_source=ig
// (or fb) and utm_medium=paid, which is what the GA source list already shows.
const PAID_MEDIUM = /^(paid|paid[_-]?social|cpc|ppc|cpm|display|paidsearch|paid[_-]?search)$/i;

export function isPaidAttribution(a: { utm_medium?: string | null; click_id_kind?: string | null } | null | undefined): boolean {
  if (!a) return false;
  if (a.click_id_kind) return true;
  return !!a.utm_medium && PAID_MEDIUM.test(a.utm_medium);
}

// Reads the campaign parameters off a URL. Returns null when the visit carried
// none, so an organic page view never overwrites a remembered ad click.
export function attributionFromUrl(href: string, now: Date = new Date()): Attribution | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const p = url.searchParams;
  const pick = (k: string) => { const v = p.get(k); return v && v.trim() ? v.trim().slice(0, 120) : undefined; };
  let click_id_kind: Attribution["click_id_kind"];
  for (const [param, kind] of Object.entries(CLICK_ID_PARAMS)) {
    if (p.get(param)) { click_id_kind = kind as Attribution["click_id_kind"]; break; }
  }
  const a: Attribution = {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    content: pick("utm_content"),
    click_id_kind,
    landing_path: url.pathname.slice(0, 200),
    attributed_at: now.toISOString(),
  };
  if (!a.source && !a.medium && !a.campaign && !a.click_id_kind) return null;
  // A bare fbclid with no utm_* is still a Meta ad click; name it so the
  // dashboard can group it with the tagged ones.
  if (!a.source && click_id_kind) a.source = click_id_kind;
  if (!a.medium && click_id_kind) a.medium = "paid";
  return a;
}

// ── Browser side ─────────────────────────────────────────────────────────────

// Remembers the current page's campaign parameters when it has any (last
// touch wins, since the question is whether an ad brought this booking).
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const a = attributionFromUrl(window.location.href);
  if (!a) return;
  try { window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(a)); } catch { /* private mode */ }
}

// The remembered attribution, if it is still inside the window.
export function readAttribution(now: Date = new Date()): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = attributionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const at = parsed.data.attributed_at ? Date.parse(parsed.data.attributed_at) : NaN;
    if (!Number.isFinite(at) || now.getTime() - at > ATTRIBUTION_TTL_DAYS * 86400000) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
