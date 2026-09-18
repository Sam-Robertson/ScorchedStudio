import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SMS_CONSENT_TEXT, PRIVACY_POLICY_PATH, TERMS_PATH } from "./consent-copy.ts";

// Guards the A2P 10DLC disclosures on /privacy and /terms.
//
// Carrier reviewers open both pages and look for specific phrases. A copy edit
// that drops one of them does not break a build, does not fail a type check,
// and does not show up in review, but it can get the campaign rejected or the
// number filtered weeks later. These tests are the tripwire.
//
// What this proves and what it does not: the project's runner is plain
// `node --test` with type stripping, which cannot parse JSX, so the pages
// cannot be imported and rendered here. Instead the source is read and reduced
// to its visible prose. That catches deletion, rewording, and typos, which is
// the failure mode worth catching. It does not prove the page compiles or that
// a phrase is actually visible rather than, say, inside a hidden element. The
// production build covers the first, and neither page has conditional rendering.

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..", "app");

const PRIVACY_FILE = join(appDir, "privacy", "page.tsx");
const TERMS_FILE = join(appDir, "terms", "page.tsx");

// Structural checks (ids, hrefs, directives) have to look at the real source,
// because visibleText() deliberately strips the markup they live in.
function source(file: string): string {
  return readFileSync(file, "utf8");
}

// Comments are stripped before checking for things like a noindex directive,
// so a comment explaining why one was removed does not read as one being set.
function sourceWithoutComments(file: string): string {
  return source(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

// Reduce a JSX page to roughly what a reader sees: drop the comments, tags, and
// string expressions that JSX scatters through prose, then collapse whitespace
// so a phrase broken across source lines still matches.
function visibleText(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ") // JSX comments
    .replace(/^\s*\/\/.*$/gm, " ") // line comments
    .replace(/\{"\s*"\}/g, " ") // {" "} spacers
    .replace(/<[^>]*>/g, " ") // tags
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const privacy = visibleText(PRIVACY_FILE);
const terms = visibleText(TERMS_FILE);

// The two sentences carrier reviewers search for word for word. The first is
// near-universal in 10DLC review; the second is what they look for to confirm
// opt-in data specifically is not resold.
const NO_SHARING_MOBILE =
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.";
const NO_SHARING_OPT_IN =
  "Text messaging originator opt-in data and consent will not be shared with any third parties.";

test("the privacy policy carries both no-sharing sentences verbatim", () => {
  assert.ok(privacy.includes(NO_SHARING_MOBILE), "missing the mobile information sentence");
  assert.ok(privacy.includes(NO_SHARING_OPT_IN), "missing the opt-in data sentence");
});

test("the privacy policy has the SMS section reviewers are linked to", () => {
  // The opt-in checkboxes and the terms page both deep link to #sms.
  assert.match(source(PRIVACY_FILE), /id="sms"/);
});

test("the privacy policy states the required SMS mechanics", () => {
  for (const phrase of [
    "Message frequency varies.",
    "Message and data rates may apply.",
    "STOP",
    "START",
    "HELP",
    "contact@scorchedstudio.com",
  ]) {
    assert.ok(privacy.includes(phrase), `privacy policy is missing: ${phrase}`);
  }
});

test("the privacy policy says what is collected for SMS consent", () => {
  // These five are what the consent log actually stores, and what proves an
  // opt-in if anyone ever challenges it.
  for (const phrase of ["mobile number", "IP address", "waiver", "booking checkout", "footer signup"]) {
    assert.ok(privacy.toLowerCase().includes(phrase.toLowerCase()), `missing: ${phrase}`);
  }
});

test("the terms page carries every clause CTIA requires", () => {
  for (const phrase of [
    "Message frequency varies.",
    "Message and data rates may apply.",
    "Reply STOP",
    "Reply START",
    "Reply HELP",
    "Consent is not a condition of purchase",
    "Mobile carriers are not liable for delayed or undelivered messages",
    "contact@scorchedstudio.com",
  ]) {
    assert.ok(terms.includes(phrase), `terms page is missing: ${phrase}`);
  }
});

test("the terms page has its own SMS section, not just a mention", () => {
  assert.match(source(TERMS_FILE), /id="sms"/);
  assert.ok(terms.includes("SMS Terms"), "missing the SMS Terms heading");
});

test("the terms page repeats the no-sharing promise", () => {
  // Reviewers do not always click through to the privacy policy.
  assert.ok(terms.includes(NO_SHARING_MOBILE), "terms page is missing the no-sharing sentence");
});

test("the terms page names the three opt-in points, matching the registration", () => {
  for (const phrase of ["waiver", "booking checkout", "footer"]) {
    assert.ok(terms.toLowerCase().includes(phrase.toLowerCase()), `missing: ${phrase}`);
  }
});

test("the terms page quotes the live checkbox wording exactly", () => {
  // If the checkbox copy is ever edited, this fails, which is the point: the
  // page, the checkbox, and the 10DLC registration have to agree.
  assert.ok(
    terms.includes(SMS_CONSENT_TEXT),
    "the consent wording quoted on the terms page no longer matches SMS_CONSENT_TEXT"
  );
});

test("the two pages link to each other", () => {
  assert.ok(source(PRIVACY_FILE).includes('href="/terms'), "privacy policy does not link to the terms");
  assert.ok(source(TERMS_FILE).includes('href="/privacy'), "terms do not link to the privacy policy");
});

test("neither page says anything is sold or shared for marketing", () => {
  // A stray "we may share your information with partners" anywhere on either
  // page contradicts the no-sharing statement and is a rejection risk.
  for (const [name, text] of [["privacy", privacy], ["terms", terms]] as const) {
    assert.ok(!/\bwe (may )?sell\b/i.test(text), `${name} suggests selling personal information`);
    assert.ok(
      !/share[^.]*\bwith (our )?(partners|advertisers|affiliates)\b/i.test(text),
      `${name} suggests sharing with partners or advertisers`
    );
  }
});

test("the opt-in checkbox links point at pages that exist", () => {
  // TERMS_PATH used to be an anchor inside the privacy policy. A 10DLC reviewer
  // is told there is a terms page, so it has to be a real one.
  assert.equal(PRIVACY_POLICY_PATH, "/privacy");
  assert.ok(TERMS_PATH.startsWith("/terms"), `TERMS_PATH should point at /terms, got ${TERMS_PATH}`);
});

test("both pages are server rendered, so reviewers see the text in the HTML", () => {
  // A "use client" directive would mean the disclosures arrive only after
  // hydration, which a reviewer fetching the raw HTML may never see.
  for (const [name, file] of [["privacy", PRIVACY_FILE], ["terms", TERMS_FILE]] as const) {
    assert.ok(
      !/^\s*["']use client["']/m.test(sourceWithoutComments(file)),
      `${name} page must not be a client component`
    );
  }
});

test("neither page is hidden from crawlers", () => {
  // /privacy carried robots: "noindex" until this audit.
  for (const [name, file] of [["privacy", PRIVACY_FILE], ["terms", TERMS_FILE]] as const) {
    assert.ok(
      !/robots:\s*["'][^"']*noindex/.test(sourceWithoutComments(file)),
      `${name} page is set to noindex`
    );
  }
});

test("the keyword phrases survive contiguously in the rendered HTML", () => {
  // Emphasis markup used to split these: "Reply <strong>HELP</strong>" reads
  // correctly to a human but leaves no contiguous "Reply HELP" in the HTML, so
  // an automated reviewer scanning the raw response would score it as missing.
  // Whole phrases are wrapped instead of bare keywords.
  const stripTagsOnly = (file: string) =>
    source(file)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/<\/?strong>/g, "")
      .replace(/\s*\n\s*/g, " ");

  const termsHtml = stripTagsOnly(TERMS_FILE);
  for (const phrase of ["Reply STOP", "Reply START", "Reply HELP"]) {
    assert.ok(termsHtml.includes(phrase), `terms page splits "${phrase}" across markup`);
  }

  const privacyHtml = stripTagsOnly(PRIVACY_FILE);
  for (const phrase of ["Reply STOP", "Reply START", "Reply HELP"]) {
    assert.ok(privacyHtml.includes(phrase), `privacy policy splits "${phrase}" across markup`);
  }
});
