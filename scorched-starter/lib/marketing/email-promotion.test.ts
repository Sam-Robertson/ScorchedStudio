import test from "node:test";
import assert from "node:assert/strict";
import {
  promotionAnnotations,
  promotionIssues,
  promotionJsonLd,
  promotionSchema,
  studioDayEnd,
  studioDayStart,
} from "./email-promotion.ts";

const full = promotionSchema.parse({
  enabled: true,
  dealText: "Half price first month",
  startsOn: "2026-11-02",
  endsOn: "2026-11-30",
  offerUrl: "https://www.scorchedstudio.com/memberships",
  imageUrl: "https://www.scorchedstudio.com/email/member-nov-hero-card.png",
  headline: "Ember $10, Blaze $30 for your first month",
});

test("studio day boundaries carry the Mountain offset for that date", () => {
  assert.equal(studioDayStart("2026-11-02"), "2026-11-02T00:00:00-07:00");
  assert.equal(studioDayEnd("2026-11-30"), "2026-11-30T23:59:59-07:00");
  // Daylight time in summer.
  assert.equal(studioDayEnd("2026-07-04"), "2026-07-04T23:59:59-06:00");
});

test("a full promotion produces a deal and a card", () => {
  const out = promotionAnnotations(full, { merchantUrl: "https://www.scorchedstudio.com" });
  assert.ok(out);
  assert.equal(out.length, 2);
  const [deal, card] = out;
  assert.equal(deal["@type"], "DiscountOffer");
  assert.equal(deal.description, "Half price first month");
  assert.equal(deal.availabilityStarts, "2026-11-02T00:00:00-07:00");
  assert.equal(deal.availabilityEnds, "2026-11-30T23:59:59-07:00");
  assert.equal(deal.offerPageUrl, "https://www.scorchedstudio.com/memberships");
  assert.equal(deal.merchantHomepageUrl, "https://www.scorchedstudio.com");
  assert.equal(card["@type"], "PromotionCard");
  assert.equal(card.image, full.imageUrl);
  assert.equal(card.url, full.offerUrl);
  assert.equal(card.headline, full.headline);
});

test("a disabled or empty promotion produces nothing", () => {
  assert.equal(promotionAnnotations(null), null);
  assert.equal(promotionAnnotations({ ...full, enabled: false }), null);
  assert.equal(promotionAnnotations(promotionSchema.parse({ enabled: true })), null);
});

test("the card is dropped without an https image and link, the deal stays", () => {
  const out = promotionAnnotations({ ...full, imageUrl: "http://insecure.example/x.png" });
  assert.ok(out);
  assert.equal(out.length, 1);
  assert.equal(out[0]["@type"], "DiscountOffer");
});

test("the JSON-LD cannot close its own script element", () => {
  const json = promotionJsonLd({ ...full, headline: "</script><script>alert(1)</script>" });
  assert.ok(json);
  assert.ok(!json.includes("</script>"));
  assert.ok(json.includes("<\\/script>"));
  assert.deepEqual(JSON.parse(json)[1].headline, "</script><script>alert(1)</script>");
});

test("issues flag an expired end date and bare http links", () => {
  const now = new Date("2026-12-05T12:00:00Z");
  const issues = promotionIssues({ ...full, offerUrl: "http://scorchedstudio.com/memberships" }, now);
  assert.ok(issues.some((i) => i.level === "error" && /past/.test(i.message)));
  assert.ok(issues.some((i) => i.level === "error" && /link must be an https/.test(i.message)));
  assert.deepEqual(promotionIssues(full, new Date("2026-11-10T12:00:00Z")), []);
  assert.deepEqual(promotionIssues({ ...full, enabled: false }, now), []);
});
