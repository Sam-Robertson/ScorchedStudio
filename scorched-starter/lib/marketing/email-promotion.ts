// lib/marketing/email-promotion.ts
//
// Gmail Promotions tab annotations. A block of schema.org JSON-LD in the
// message head that Gmail reads to show a deal badge ("Half price first
// month", "Ends Nov 30") beside the subject and a highlighted image card at
// the top of the Promotions tab. Other mail clients ignore it, and Gmail only
// uses it for mail already sorted into Promotions. It has no effect on which
// tab the email lands in.
//
// Spec: https://developers.google.com/workspace/gmail/promotab/overview
import { z } from "zod";

const ymd = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-30")
  .or(z.literal(""));

export const promotionSchema = z.object({
  enabled: z.boolean().default(false),
  // Deal badge text. Google asks for four words or fewer.
  dealText: z.string().trim().max(40).default(""),
  discountCode: z.string().trim().max(30).default(""),
  // Calendar dates in studio time. Expanded to the first and last second of
  // the day in America/Denver when rendered, which is what Gmail compares
  // against to decide whether the offer is still running.
  startsOn: ymd.default(""),
  endsOn: ymd.default(""),
  // Where the card's image and the deal's "Shop now" button go.
  offerUrl: z.string().trim().max(500).default(""),
  // The card image. PNG or JPEG, 1.91:1 (for example 1200 by 628). Gmail
  // center-crops anything else.
  imageUrl: z.string().trim().max(500).default(""),
  headline: z.string().trim().max(120).default(""),
});

export type EmailPromotion = z.infer<typeof promotionSchema>;

export const DEFAULT_PROMOTION: EmailPromotion = promotionSchema.parse({});

export function parsePromotion(raw: unknown): EmailPromotion | null {
  if (raw == null) return null;
  const parsed = promotionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const STUDIO_TZ = "America/Denver";

// "-07:00" or "-06:00" for a given calendar day in studio time. Mountain time
// changes offset twice a year, so it is looked up rather than hardcoded.
function offsetOn(ymdDate: string): string {
  const noonUtc = new Date(`${ymdDate}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, timeZoneName: "longOffset" })
    .formatToParts(noonUtc)
    .find((p) => p.type === "timeZoneName")?.value;
  // "GMT-07:00" -> "-07:00"; a bare "GMT" means UTC.
  const m = part?.match(/([+-]\d{2}:\d{2})$/);
  return m ? m[1] : "+00:00";
}

export function studioDayStart(ymdDate: string): string {
  return `${ymdDate}T00:00:00${offsetOn(ymdDate)}`;
}

export function studioDayEnd(ymdDate: string): string {
  return `${ymdDate}T23:59:59${offsetOn(ymdDate)}`;
}

function isHttps(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url);
}

// What Gmail would be given, as plain objects. Null when the promotion is off
// or has nothing it could show.
export function promotionAnnotations(
  promo: EmailPromotion | null | undefined,
  opts: { merchantUrl?: string } = {}
): Record<string, unknown>[] | null {
  if (!promo || !promo.enabled) return null;
  const out: Record<string, unknown>[] = [];

  // Deal badge. Google wants at least one of a description, a code, or an end
  // date; without any of them there is nothing to put on the badge.
  if (promo.dealText || promo.discountCode || promo.endsOn) {
    const deal: Record<string, unknown> = { "@context": "http://schema.org/", "@type": "DiscountOffer" };
    if (promo.dealText) deal.description = promo.dealText;
    if (promo.discountCode) deal.discountCode = promo.discountCode;
    if (promo.startsOn) deal.availabilityStarts = studioDayStart(promo.startsOn);
    if (promo.endsOn) deal.availabilityEnds = studioDayEnd(promo.endsOn);
    if (isHttps(promo.offerUrl)) deal.offerPageUrl = promo.offerUrl;
    if (opts.merchantUrl && isHttps(opts.merchantUrl)) deal.merchantHomepageUrl = opts.merchantUrl;
    out.push(deal);
  }

  // Image card. Both image and url are required by the spec.
  if (isHttps(promo.imageUrl) && isHttps(promo.offerUrl)) {
    const card: Record<string, unknown> = {
      "@context": "http://schema.org/",
      "@type": "PromotionCard",
      image: promo.imageUrl,
      url: promo.offerUrl,
    };
    if (promo.headline) card.headline = promo.headline;
    out.push(card);
  }

  return out.length ? out : null;
}

// The JSON-LD text for a <script type="application/ld+json"> in the head.
// "</" is escaped so a value can never close the script element early.
export function promotionJsonLd(
  promo: EmailPromotion | null | undefined,
  opts: { merchantUrl?: string } = {}
): string | null {
  const annotations = promotionAnnotations(promo, opts);
  if (!annotations) return null;
  return JSON.stringify(annotations).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}

// Same shape as the builder's DocumentIssue so the two lists can be merged.
export type PromotionIssue = { level: "error" | "warning"; message: string; blockId?: string };

// Pre-send checks, shown in the builder next to the document's own.
export function promotionIssues(
  promo: EmailPromotion | null | undefined,
  now: Date = new Date()
): PromotionIssue[] {
  if (!promo || !promo.enabled) return [];
  const issues: PromotionIssue[] = [];

  if (!promotionAnnotations(promo)) {
    issues.push({
      level: "warning",
      message: "The Gmail promotion is on but has nothing to show. Add deal text, an end date, or an image with a link.",
    });
  }
  if (promo.imageUrl && !isHttps(promo.imageUrl)) {
    issues.push({ level: "error", message: "The Gmail promotion image must be an https URL." });
  }
  if (promo.offerUrl && !isHttps(promo.offerUrl)) {
    issues.push({ level: "error", message: "The Gmail promotion link must be an https URL." });
  }
  if (promo.imageUrl && !promo.offerUrl) {
    issues.push({ level: "warning", message: "The Gmail promotion image needs a link to show as a card." });
  }
  if (promo.endsOn && new Date(studioDayEnd(promo.endsOn)) < now) {
    issues.push({ level: "error", message: "The Gmail promotion end date is in the past, so Gmail will treat the offer as over." });
  }
  if (promo.dealText.split(/\s+/).filter(Boolean).length > 4) {
    issues.push({ level: "warning", message: "Gmail deal text works best at four words or fewer." });
  }
  return issues;
}
