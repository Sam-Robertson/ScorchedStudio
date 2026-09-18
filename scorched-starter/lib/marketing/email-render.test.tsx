// lib/marketing/email-render.test.tsx
//
// Runs under tsx rather than node --experimental-strip-types, because the
// renderer is JSX and the strip-types loader cannot parse it. See the "test"
// script in package.json, which runs both.
//
// The point of these is the footer. Everything else here could regress and
// produce an ugly email; a missing postal address or unsubscribe link produces
// an illegal one.
import test from "node:test";
import assert from "node:assert/strict";
import { renderDocument, renderCampaign, personalize, UNSUBSCRIBE_PLACEHOLDER } from "./email-render.ts";
import type { CampaignRecord } from "../supabase.ts";
import { DEFAULT_DESIGN, type EmailBlock } from "./email-blocks.ts";
import { BUSINESS_POSTAL_ADDRESS } from "./consent-copy.ts";

function block(partial: Record<string, unknown>): EmailBlock {
  return partial as unknown as EmailBlock;
}

const UNSUB = "https://scorchedstudio.com/u/abc123";

test("an empty email still carries the postal address and unsubscribe link", async () => {
  // The compliance floor. If the footer ever becomes deletable from the
  // editor, this is the test that fails.
  const out = await renderDocument([], DEFAULT_DESIGN, { subject: "Hi" });

  assert.ok(out.html.includes(BUSINESS_POSTAL_ADDRESS), "HTML must carry the postal address");
  assert.ok(out.html.includes(UNSUBSCRIBE_PLACEHOLDER), "HTML must carry the unsubscribe link");
  assert.ok(out.text.includes(BUSINESS_POSTAL_ADDRESS), "text must carry the postal address");
  assert.ok(out.text.includes(UNSUBSCRIBE_PLACEHOLDER), "text must carry the unsubscribe link");
});

test("the footer survives whatever the block array holds", async () => {
  const out = await renderDocument(
    [
      block({ id: "1", type: "heading", text: "Sale", level: 1, align: "left" }),
      block({ id: "2", type: "divider" }),
      block({ id: "3", type: "spacer", size: "lg" }),
    ],
    DEFAULT_DESIGN,
    { subject: "Sale" }
  );
  assert.ok(out.html.includes(BUSINESS_POSTAL_ADDRESS));
  assert.ok(out.text.includes(BUSINESS_POSTAL_ADDRESS));
});

test("blocks render into both halves of the message", async () => {
  const out = await renderDocument(
    [
      block({ id: "1", type: "heading", text: "Big news", level: 1, align: "left" }),
      block({ id: "2", type: "text", html: "<p>We made a thing</p>", align: "left" }),
      block({ id: "3", type: "button", label: "Book now", href: "https://example.com/book", align: "center" }),
    ],
    DEFAULT_DESIGN,
    { subject: "Big news", previewText: "A teaser" }
  );

  assert.ok(out.html.includes("Big news"));
  assert.ok(out.html.includes("We made a thing"));
  assert.ok(out.html.includes("https://example.com/book"));

  assert.ok(out.text.includes("Big news"));
  assert.ok(out.text.includes("We made a thing"));
  assert.ok(out.text.includes("https://example.com/book"), "the text half needs the URL spelled out");
});

test("preview text is rendered for the inbox line", async () => {
  const out = await renderDocument([], DEFAULT_DESIGN, { subject: "Hi", previewText: "Peek inside" });
  assert.ok(out.html.includes("Peek inside"));
  assert.equal(out.previewText, "Peek inside");
});

test("design tokens reach the markup", async () => {
  const out = await renderDocument(
    [block({ id: "1", type: "button", label: "Go", href: "https://example.com", align: "center" })],
    { ...DEFAULT_DESIGN, buttonColor: "#123456", backgroundColor: "#ABCDEF" },
    { subject: "Hi" }
  );
  assert.ok(out.html.toLowerCase().includes("#123456"), "button color should be inlined");
  assert.ok(out.html.toLowerCase().includes("#abcdef"), "background color should be inlined");
});

test("personalize swaps in the recipient's own unsubscribe URL", async () => {
  const template = await renderDocument([], DEFAULT_DESIGN, { subject: "Hi" });
  const copy = personalize(template, { firstName: "Sam", unsubscribeUrl: UNSUB });

  assert.ok(copy.html.includes(UNSUB));
  assert.ok(copy.text.includes(UNSUB));
  // A leftover placeholder would mean a dead unsubscribe link in a real send.
  assert.ok(!copy.html.includes(UNSUBSCRIBE_PLACEHOLDER), "no placeholder may survive");
  assert.ok(!copy.text.includes(UNSUBSCRIBE_PLACEHOLDER), "no placeholder may survive");
});

test("personalize resolves merge tags in both halves and the subject", async () => {
  const template = await renderDocument(
    [block({ id: "1", type: "text", html: "<p>Hi {{first_name}}, welcome back.</p>", align: "left" })],
    DEFAULT_DESIGN,
    { subject: "A note for {{first_name}}" }
  );

  const known = personalize(template, { firstName: "Sam", unsubscribeUrl: UNSUB });
  assert.ok(known.html.includes("Hi Sam, welcome back."));
  assert.ok(known.text.includes("Hi Sam, welcome back."));
  assert.equal(known.subject, "A note for Sam");

  // Most of the imported list has no first name on file.
  const unknown = personalize(template, { firstName: null, unsubscribeUrl: UNSUB });
  assert.ok(unknown.html.includes("Hi there, welcome back."));
  assert.ok(!unknown.html.includes("{{first_name}}"), "an unresolved tag must never ship");
});

test("personalize escapes a name in HTML but not in plain text", async () => {
  const template = await renderDocument(
    [block({ id: "1", type: "text", html: "<p>Hi {{first_name}}</p>", align: "left" })],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  const copy = personalize(template, { firstName: "<b>Sam</b>", unsubscribeUrl: UNSUB });

  assert.ok(copy.html.includes("&lt;b&gt;Sam&lt;/b&gt;"), "HTML half must escape the name");
  assert.ok(copy.text.includes("<b>Sam</b>"), "text half must not escape it");
});

// ---------------------------------------------------------------------------
// The pre-builder path
// ---------------------------------------------------------------------------

function legacyCampaign(over: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "c1",
    channel: "email",
    name: "Old campaign",
    subject: "An old subject",
    body: "Some **markdown** body.",
    blocks: null,
    design: null,
    preview_text: null,
    media_url: null,
    segment: {},
    status: "draft",
    scheduled_for: null,
    created_by: "admin",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...over,
  } as CampaignRecord;
}

test("a campaign written before the builder still renders", async () => {
  // blocks IS NULL means markdown, and those drafts must keep working
  // untouched rather than being migrated into blocks.
  const out = await renderCampaign(legacyCampaign());

  assert.ok(out.html.includes("markdown"), "the markdown body should render");
  assert.ok(out.html.includes(BUSINESS_POSTAL_ADDRESS), "the old template carries the address too");
  assert.ok(out.html.includes(UNSUBSCRIBE_PLACEHOLDER));
  assert.ok(out.text.includes(UNSUBSCRIBE_PLACEHOLDER));
});

test("a block campaign renders through the block path", async () => {
  const out = await renderCampaign(
    legacyCampaign({
      subject: "New style",
      blocks: [{ id: "1", type: "heading", text: "From blocks", level: 1, align: "left" }],
      design: { buttonColor: "#884A20" },
    })
  );
  assert.ok(out.html.includes("From blocks"));
  // The markdown body must not leak into a block campaign.
  assert.ok(!out.html.includes("markdown"), "block campaigns ignore the legacy body column");
});
