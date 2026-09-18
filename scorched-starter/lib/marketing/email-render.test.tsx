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

// ---------------------------------------------------------------------------
// Image beside text
// ---------------------------------------------------------------------------

test("an image-and-text block puts both in a two-column table", async () => {
  const out = await renderDocument(
    [
      block({
        id: "1",
        type: "columns",
        imageSrc: "https://example.com/bowls.jpg",
        imageAlt: "Stacked bowls",
        title: "Something we made",
        body: "<p>A <strong>short</strong> paragraph.</p>",
        href: "",
        imagePosition: "left",
        imageWidth: "40",
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );

  assert.ok(out.html.includes("bowls.jpg"));
  assert.ok(out.html.includes("Something we made"));
  // Rich text has to survive, which is the whole reason the body is HTML.
  assert.ok(out.html.includes("<strong>short</strong>"), "formatting must reach the email");
  // A table is what makes side-by-side work in Outlook.
  assert.ok(out.html.includes("<table"), "must render as a table, not a flex row");
  assert.ok(out.html.includes("40%") && out.html.includes("60%"), "both column widths should be set");
});

test("the image width control changes the split", async () => {
  const out = await renderDocument(
    [
      block({
        id: "1",
        type: "columns",
        imageSrc: "https://example.com/a.jpg",
        imageAlt: "",
        title: "",
        body: "<p>Words</p>",
        href: "",
        imagePosition: "right",
        imageWidth: "33",
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  assert.ok(out.html.includes("33%"));
  assert.ok(out.html.includes("67%"));
});

test("the stacking class is on both cells so a phone does not squash them", async () => {
  const out = await renderDocument(
    [
      block({
        id: "1",
        type: "columns",
        imageSrc: "https://example.com/a.jpg",
        imageAlt: "",
        title: "",
        body: "<p>Words</p>",
        href: "",
        imagePosition: "left",
        imageWidth: "50",
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  // Two cells carry the class; a third mention is the rule in the stylesheet.
  assert.equal((out.html.match(/class="[^"]*sc-stack/g) ?? []).length, 2, "both cells need the class");
  assert.ok(/@media[^{]*max-width[^{]*\{[^}]*sc-stack/.test(out.html), "the stacking rule must be in the document");
});

// ---------------------------------------------------------------------------
// Formatting in headings and titles
// ---------------------------------------------------------------------------

test("formatting inside a heading reaches the email", async () => {
  const out = await renderDocument(
    [block({ id: "1", type: "heading", text: 'A <strong>big</strong> <a href="https://x.com">sale</a>', level: 1, align: "left" })],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );

  assert.ok(out.html.includes("<h1"), "should render a real heading tag");
  assert.ok(out.html.includes("<strong>big</strong>"), out.html.slice(0, 400));
  assert.ok(out.html.includes("https://x.com"));
  // The text half gets the words, not the tags.
  assert.ok(out.text.includes("A big sale"), out.text);
});

test("heading level picks the right tag", async () => {
  for (const [level, tag] of [[1, "h1"], [2, "h2"], [3, "h3"]] as const) {
    const out = await renderDocument(
      [block({ id: "1", type: "heading", text: "Hello", level, align: "left" })],
      DEFAULT_DESIGN,
      { subject: "Hi" }
    );
    assert.ok(out.html.includes(`<${tag}`), `level ${level} should render <${tag}>`);
  }
});

test("a formatted card title renders as markup", async () => {
  const out = await renderDocument(
    [
      block({
        id: "1",
        type: "card",
        imageSrc: "",
        imageAlt: "",
        title: "<em>Beginner</em> night",
        meta: "Saturday",
        body: "Come along",
        buttonLabel: "Book",
        buttonHref: "https://example.com",
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  assert.ok(out.html.includes("<em>Beginner</em>"));
  assert.ok(out.text.includes("Beginner night"), out.text);
});

// ---------------------------------------------------------------------------
// Images side by side
// ---------------------------------------------------------------------------

test("two images render as one table row, not stacked", async () => {
  const out = await renderDocument(
    [
      block({
        id: "r",
        type: "imageRow",
        images: [
          { src: "https://example.com/1.jpg", alt: "One", href: "" },
          { src: "https://example.com/2.jpg", alt: "Two", href: "https://example.com/book" },
        ],
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );

  assert.ok(out.html.includes("1.jpg"));
  assert.ok(out.html.includes("2.jpg"));
  assert.ok(out.html.includes("<table"), "side by side needs a table for Outlook");
  const halves = out.html.match(/width:\s*50(\.0+)?%/g) ?? [];
  assert.equal(halves.length, 2, "two images should split the width evenly");
  // Every cell must have identical padding. Putting the gap on the inner edge
  // only makes the first image narrower than the last, which is exactly what
  // it looked like in a real inbox.
  const paddings = (out.html.match(/padding-left:[^;"]*/g) ?? []).filter(
    // The stylesheet's mobile rule mentions padding too; only the inline
    // styles on the cells are being compared here.
    (p) => !p.includes("!important")
  );
  assert.equal(paddings.length, 2, "both cells should carry padding");
  assert.equal(new Set(paddings).size, 1, `cells have different padding: ${paddings.join(" | ")}`);
  assert.ok(out.html.includes("https://example.com/book"), "a linked image keeps its link");
  // Both cells stack on a phone.
  assert.equal((out.html.match(/class="[^"]*sc-stack/g) ?? []).length, 2);
});

test("three images split the width three ways", async () => {
  const out = await renderDocument(
    [
      block({
        id: "r",
        type: "imageRow",
        images: [
          { src: "https://example.com/1.jpg", alt: "", href: "" },
          { src: "https://example.com/2.jpg", alt: "", href: "" },
          { src: "https://example.com/3.jpg", alt: "", href: "" },
        ],
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  // Not floored to 33, which would leave a 1% remainder on one column.
  const widths = out.html.match(/width:\s*33\.3333%/g) ?? [];
  assert.equal(widths.length, 3, "all three columns should be exactly equal");
  assert.equal((out.html.match(/class="[^"]*sc-stack/g) ?? []).length, 3);
});

test("an image row with nothing chosen renders nothing rather than empty cells", async () => {
  const out = await renderDocument(
    [
      block({
        id: "r",
        type: "imageRow",
        images: [
          { src: "", alt: "", href: "" },
          { src: "", alt: "", href: "" },
        ],
      }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  assert.equal(
    (out.html.match(/class="[^"]*sc-stack/g) ?? []).length,
    0,
    "no empty columns should be emitted"
  );
  // The footer still has to be there.
  assert.ok(out.html.includes(BUSINESS_POSTAL_ADDRESS));
});

test("an image renders at the width it was given", async () => {
  const out = await renderDocument(
    [block({ id: "1", type: "image", src: "https://example.com/a.jpg", alt: "A", width: 65, align: "center", href: "" })],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  assert.ok(out.html.includes("65%"), "the chosen width should be inlined");
});

test("every block is tagged with its id so the preview can select it", async () => {
  const out = await renderDocument(
    [
      block({ id: "first", type: "heading", text: "Hello", level: 1, align: "left" }),
      block({ id: "second", type: "divider" }),
    ],
    DEFAULT_DESIGN,
    { subject: "Hi" }
  );
  assert.ok(out.html.includes('data-block-id="first"'), out.html.slice(0, 300));
  assert.ok(out.html.includes('data-block-id="second"'));
});
