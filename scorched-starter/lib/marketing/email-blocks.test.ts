// lib/marketing/email-blocks.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMergeTags,
  blocksFromLegacyHtml,
  blocksToPlainText,
  checkDocument,
  combineImageWithText,
  createBlock,
  ensureHtml,
  escapeHtml,
  htmlToPlainText,
  mergeTagsUsed,
  parseDocument,
  splitColumns,
  DEFAULT_DESIGN,
  type EmailBlock,
} from "./email-blocks.ts";
import { sanitizeEmailHtml } from "./sanitize-email-html.ts";

function block(partial: Record<string, unknown>): EmailBlock {
  return partial as unknown as EmailBlock;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("parseDocument fills defaults for a bare block", () => {
  const doc = parseDocument([{ id: "a", type: "heading", text: "Hi" }], null);
  assert.equal(doc.blocks.length, 1);
  const heading = doc.blocks[0];
  assert.equal(heading.type, "heading");
  if (heading.type !== "heading") return;
  assert.equal(heading.level, 2);
  assert.equal(heading.align, "left");
});

test("parseDocument drops malformed blocks instead of throwing", () => {
  // One good, one with an unknown type, one that is not an object at all.
  const doc = parseDocument(
    [{ id: "a", type: "heading", text: "Kept" }, { id: "b", type: "carousel" }, "nonsense"],
    null
  );
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].id, "a");
});

test("parseDocument falls back to the default design", () => {
  assert.deepEqual(parseDocument([], null).design, DEFAULT_DESIGN);
  assert.deepEqual(parseDocument([], "not an object").design, DEFAULT_DESIGN);
});

test("parseDocument keeps design values it recognises", () => {
  const doc = parseDocument([], { buttonColor: "#000000", contentWidth: 520 });
  assert.equal(doc.design.buttonColor, "#000000");
  assert.equal(doc.design.contentWidth, 520);
  // Untouched keys still come from the defaults.
  assert.equal(doc.design.textColor, DEFAULT_DESIGN.textColor);
});

test("createBlock produces a valid block of every type", () => {
  for (const type of ["heading", "text", "image", "button", "divider", "spacer", "quote", "columns", "card", "social"] as const) {
    const made = createBlock(type);
    assert.equal(made.type, type);
    assert.ok(made.id.length > 0, `${type} should get an id`);
  }
});

// ---------------------------------------------------------------------------
// Merge tags
// ---------------------------------------------------------------------------

test("applyMergeTags substitutes a known first name", () => {
  assert.equal(applyMergeTags("Hi {{first_name}}!", { firstName: "Sam" }), "Hi Sam!");
});

test("applyMergeTags falls back when the name is missing", () => {
  assert.equal(applyMergeTags("Hi {{first_name}}!", {}), "Hi there!");
  assert.equal(applyMergeTags("Hi {{first_name}}!", { firstName: "   " }), "Hi there!");
});

test("applyMergeTags honours a custom fallback", () => {
  assert.equal(applyMergeTags("Hi {{first_name|friend}}!", {}), "Hi friend!");
  assert.equal(applyMergeTags("Hi {{ first_name | friend }}!", { firstName: "Sam" }), "Hi Sam!");
});

test("applyMergeTags escapes the substituted value when asked", () => {
  // A subscriber name is user-supplied data landing in an HTML document.
  const out = applyMergeTags("Hi {{first_name}}", { firstName: '<img src=x onerror="alert(1)">' }, escapeHtml);
  assert.ok(!out.includes("<img"), "raw tag must not survive");
  assert.ok(out.includes("&lt;img"), "should be escaped, not dropped");
});

test("applyMergeTags leaves unknown tags alone", () => {
  assert.equal(applyMergeTags("{{last_order_date}}", { firstName: "Sam" }), "{{last_order_date}}");
});

test("mergeTagsUsed reports the tags a document contains", () => {
  const used = mergeTagsUsed([
    block({ id: "a", type: "heading", text: "Hi {{first_name}}", level: 1, align: "left" }),
    block({ id: "b", type: "text", html: "<p>Your name is {{last_name}}</p>", align: "left" }),
  ]);
  assert.deepEqual(used.sort(), ["first_name", "last_name"]);
});

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

test("htmlToPlainText keeps paragraphs apart", () => {
  assert.equal(htmlToPlainText("<p>One</p><p>Two</p>"), "One\n\nTwo");
});

test("htmlToPlainText turns breaks into newlines and decodes entities", () => {
  assert.equal(htmlToPlainText("<p>A<br>B</p>"), "A\nB");
  assert.equal(htmlToPlainText("<p>Tom &amp; Jerry</p>"), "Tom & Jerry");
});

test("htmlToPlainText strips tags without eating their text", () => {
  assert.equal(htmlToPlainText('<p>Read <a href="https://x.com">the post</a> now</p>'), "Read the post now");
});

test("blocksToPlainText renders every block type readably", () => {
  const text = blocksToPlainText([
    block({ id: "1", type: "heading", text: "Big news", level: 1, align: "left" }),
    block({ id: "2", type: "text", html: "<p>Hello there</p>", align: "left" }),
    block({ id: "3", type: "button", label: "Book", href: "https://example.com/book", align: "center" }),
    block({ id: "4", type: "divider" }),
    block({ id: "5", type: "quote", text: "So good", attribution: "A student" }),
  ]);

  assert.ok(text.includes("Big news"));
  assert.ok(text.includes("Hello there"));
  // A link is useless in plain text unless the URL itself is written out.
  assert.ok(text.includes("https://example.com/book"), "button URL must appear in the text version");
  assert.ok(text.includes("So good"));
  assert.ok(text.includes("A student"));
});

test("blocksToPlainText skips decoration that has no text", () => {
  const text = blocksToPlainText([
    block({ id: "1", type: "spacer", size: "lg" }),
    block({ id: "2", type: "image", src: "https://x/y.png", alt: "", width: "full", align: "center", href: "" }),
    block({ id: "3", type: "heading", text: "Only this", level: 2, align: "left" }),
  ]);
  assert.equal(text, "Only this");
});

test("blocksToPlainText writes an image's alt text when it has one", () => {
  const text = blocksToPlainText([
    block({ id: "1", type: "image", src: "https://x/y.png", alt: "A burned wooden sign", width: "full", align: "center", href: "" }),
  ]);
  assert.ok(text.includes("A burned wooden sign"));
});

test("blocksToPlainText never leaves more than one blank line", () => {
  const text = blocksToPlainText([
    block({ id: "1", type: "text", html: "<p>A</p><p></p><p></p><p>B</p>", align: "left" }),
  ]);
  assert.ok(!/\n{3,}/.test(text), `found a run of blank lines in: ${JSON.stringify(text)}`);
});

// ---------------------------------------------------------------------------
// Pre-send checks
// ---------------------------------------------------------------------------

test("checkDocument blocks an email with no subject or content", () => {
  const issues = checkDocument([], {});
  const errors = issues.filter((i) => i.level === "error");
  assert.ok(errors.some((e) => /no content/i.test(e.message)));
  assert.ok(errors.some((e) => /subject/i.test(e.message)));
});

test("checkDocument treats a button with no link as an error", () => {
  const issues = checkDocument(
    [block({ id: "1", type: "button", label: "Book", href: "", align: "center" })],
    { subject: "Hi", previewText: "Hi" }
  );
  assert.ok(issues.some((i) => i.level === "error" && /Book/.test(i.message)));
});

test("checkDocument treats missing alt text as a warning, not an error", () => {
  const issues = checkDocument(
    [block({ id: "1", type: "image", src: "https://x/y.png", alt: "", width: "full", align: "center", href: "" })],
    { subject: "Hi", previewText: "Hi" }
  );
  const alt = issues.find((i) => /alt text/i.test(i.message));
  assert.equal(alt?.level, "warning");
  assert.equal(issues.filter((i) => i.level === "error").length, 0);
});

test("checkDocument passes a complete email", () => {
  const issues = checkDocument(
    [
      block({ id: "1", type: "heading", text: "Hello", level: 1, align: "left" }),
      block({ id: "2", type: "text", html: "<p>Some words</p>", align: "left" }),
      block({ id: "3", type: "button", label: "Book", href: "https://example.com", align: "center" }),
    ],
    { subject: "Hello", previewText: "A short teaser" }
  );
  assert.deepEqual(issues, []);
});

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------

test("sanitizeEmailHtml removes scripts and event handlers", () => {
  const dirty = '<p onclick="steal()">Hi</p><script>alert(1)</script>';
  const clean = sanitizeEmailHtml(dirty);
  assert.ok(!clean.includes("script"), clean);
  assert.ok(!clean.includes("onclick"), clean);
  assert.ok(clean.includes("Hi"));
});

test("sanitizeEmailHtml drops javascript: links but keeps real ones", () => {
  assert.ok(!sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>').includes("javascript:"));
  assert.ok(sanitizeEmailHtml('<a href="https://example.com">x</a>').includes("https://example.com"));
  assert.ok(sanitizeEmailHtml('<a href="mailto:a@b.com">x</a>').includes("mailto:a@b.com"));
});

test("sanitizeEmailHtml keeps the formatting the editor produces", () => {
  const clean = sanitizeEmailHtml("<p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>");
  assert.ok(clean.includes("<strong>Bold</strong>"));
  assert.ok(clean.includes("<em>italic</em>"));
  assert.ok(clean.includes("<li>One</li>"));
});

test("sanitizeEmailHtml keeps text-align but discards other styles", () => {
  const clean = sanitizeEmailHtml('<p style="text-align:center;position:fixed">Hi</p>');
  assert.ok(clean.includes("text-align:center"), clean);
  assert.ok(!clean.includes("position"), clean);
});

// ---------------------------------------------------------------------------
// Opening a campaign written before the builder
// ---------------------------------------------------------------------------

test("blocksFromLegacyHtml keeps the original copy", () => {
  const blocks = blocksFromLegacyHtml("<p>Our <strong>spring</strong> class list is up.</p>");

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");

  // The words have to survive the round trip, because campaigns.body is
  // regenerated from these blocks on the first save. If this were empty, the
  // original email would be gone.
  const text = blocksToPlainText(blocks);
  assert.ok(text.includes("Our spring class list is up."), text);
});

test("blocksFromLegacyHtml leaves an empty body alone", () => {
  assert.deepEqual(blocksFromLegacyHtml(""), []);
  assert.deepEqual(blocksFromLegacyHtml("   "), []);
});

test("a legacy campaign survives load, edit, and save", () => {
  // The exact sequence that would otherwise destroy it: a row with no blocks
  // is opened, seeded, edited, and written back. campaigns.body is rebuilt
  // from the blocks on every save, so the original words have to still be
  // there afterwards.
  const originalHtml = "<p>Join us Saturday for a beginner class.</p>";

  const seeded = blocksFromLegacyHtml(originalHtml);
  const edited = [
    ...seeded,
    { id: "new", type: "button", label: "Book", href: "https://example.com", align: "center" },
  ] as EmailBlock[];

  const regeneratedBody = blocksToPlainText(edited);
  assert.ok(
    regeneratedBody.includes("Join us Saturday for a beginner class."),
    `the original copy was lost: ${JSON.stringify(regeneratedBody)}`
  );
  assert.ok(regeneratedBody.includes("https://example.com"));
});

// ---------------------------------------------------------------------------
// Image beside text
// ---------------------------------------------------------------------------

test("ensureHtml wraps a bare string but leaves markup alone", () => {
  assert.equal(ensureHtml("Just words"), "<p>Just words</p>");
  assert.equal(ensureHtml("<p>Already tagged</p>"), "<p>Already tagged</p>");
  assert.equal(ensureHtml(""), "");
  assert.equal(ensureHtml("   "), "");
});

test("ensureHtml keeps line breaks from a plain textarea", () => {
  assert.equal(ensureHtml("One\n\nTwo"), "<p>One</p><p>Two</p>");
  assert.equal(ensureHtml("One\nTwo"), "<p>One<br>Two</p>");
});

test("a columns block written before rich text still reads correctly", () => {
  // The body used to be a plain string. Those rows must not render as one run
  // of text jammed against whatever follows.
  const legacy = ensureHtml("A short paragraph about a recent piece.");
  const text = blocksToPlainText([
    block({
      id: "1",
      type: "columns",
      imageSrc: "https://x/y.png",
      imageAlt: "A bowl",
      title: "Something we made",
      body: legacy,
      href: "",
      imagePosition: "left",
      imageWidth: "40",
    }),
  ]);
  assert.ok(text.includes("Something we made"));
  assert.ok(text.includes("A short paragraph about a recent piece."), text);
});

test("columns blocks default to a sensible image width", () => {
  const made = createBlock("columns");
  assert.equal(made.type, "columns");
  if (made.type !== "columns") return;
  assert.equal(made.imageWidth, "40");
  assert.equal(made.imagePosition, "left");
});

test("a columns block parsed without imageWidth gets the default", () => {
  // Rows written before the width control existed.
  const doc = parseDocument(
    [{ id: "1", type: "columns", imageSrc: "", imageAlt: "", title: "T", body: "B", href: "", imagePosition: "left" }],
    null
  );
  assert.equal(doc.blocks.length, 1);
  const b = doc.blocks[0];
  assert.equal(b.type, "columns");
  if (b.type !== "columns") return;
  assert.equal(b.imageWidth, "40");
});

test("rich text in a columns body reaches the plain-text half", () => {
  const text = blocksToPlainText([
    block({
      id: "1",
      type: "columns",
      imageSrc: "",
      imageAlt: "",
      title: "",
      body: "<p>Read <a href=\"https://x.com\">the post</a> now</p>",
      href: "",
      imagePosition: "right",
      imageWidth: "50",
    }),
  ]);
  assert.equal(text, "Read the post now");
});

// ---------------------------------------------------------------------------
// Combining and splitting
// ---------------------------------------------------------------------------

const IMAGE = block({
  id: "img",
  type: "image",
  src: "https://example.com/bowls.jpg",
  alt: "Stacked bowls",
  width: "full",
  align: "center",
  href: "https://example.com/shop",
});

const TEXT = block({ id: "txt", type: "text", html: "<p>Some <strong>words</strong>.</p>", align: "left" });

test("combining an image with the text below it makes one block", () => {
  const out = combineImageWithText([IMAGE, TEXT], "img");

  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.type, "columns");
  if (c.type !== "columns") return;
  assert.equal(c.imageSrc, "https://example.com/bowls.jpg");
  assert.equal(c.imageAlt, "Stacked bowls");
  assert.equal(c.href, "https://example.com/shop");
  // The formatting has to survive, or combining silently costs you the bold.
  assert.equal(c.body, "<p>Some <strong>words</strong>.</p>");
});

test("combining an image with nothing below it leaves the text empty", () => {
  const out = combineImageWithText([IMAGE], "img");
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "columns");
});

test("combining only absorbs a text block, not whatever happens to be next", () => {
  const button = block({ id: "b", type: "button", label: "Go", href: "https://x.com", align: "center" });
  const out = combineImageWithText([IMAGE, button], "img");
  assert.equal(out.length, 2, "the button must survive");
  assert.equal(out[1].id, "b");
});

test("splitting puts the image and the text back", () => {
  const combined = combineImageWithText([IMAGE, TEXT], "img");
  const out = splitColumns(combined, combined[0].id);

  assert.equal(out.length, 2);
  assert.equal(out[0].type, "image");
  assert.equal(out[1].type, "text");
  if (out[0].type !== "image" || out[1].type !== "text") return;
  assert.equal(out[0].src, "https://example.com/bowls.jpg");
  assert.equal(out[0].alt, "Stacked bowls");
  assert.equal(out[0].href, "https://example.com/shop");
  assert.equal(out[1].html, "<p>Some <strong>words</strong>.</p>");
});

test("a combine then split round trip loses nothing that matters", () => {
  // The editor has no undo, so this round trip is the only way back.
  const before = blocksToPlainText([IMAGE, TEXT]);

  const combined = combineImageWithText([IMAGE, TEXT], "img");
  const restored = splitColumns(combined, combined[0].id);

  assert.equal(blocksToPlainText(restored), before);

  // Shapes too, not just the readable text.
  assert.deepEqual(restored.map((b) => b.type), ["image", "text"]);
});

test("splitting turns a title into its own heading", () => {
  const columns = block({
    id: "c",
    type: "columns",
    imageSrc: "https://example.com/a.jpg",
    imageAlt: "A",
    title: "Something we made",
    body: "<p>Words</p>",
    href: "",
    imagePosition: "left",
    imageWidth: "40",
  });
  const out = splitColumns([columns], "c");

  assert.equal(out.length, 3);
  assert.equal(out[0].type, "image");
  assert.equal(out[1].type, "heading");
  assert.equal(out[2].type, "text");
  if (out[1].type !== "heading") return;
  assert.equal(out[1].text, "Something we made");
});

test("splitting skips the parts that are empty", () => {
  const noImage = block({
    id: "c",
    type: "columns",
    imageSrc: "",
    imageAlt: "",
    title: "",
    body: "<p>Only words</p>",
    href: "",
    imagePosition: "left",
    imageWidth: "40",
  });
  const out = splitColumns([noImage], "c");
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "text");
});

test("splitting an entirely empty block does not delete it", () => {
  // Otherwise the button would read as Split and behave as Delete.
  const empty = block({
    id: "c",
    type: "columns",
    imageSrc: "",
    imageAlt: "",
    title: "",
    body: "",
    href: "",
    imagePosition: "left",
    imageWidth: "40",
  });
  const out = splitColumns([empty], "c");
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "columns");
});

test("both transforms leave surrounding blocks and their order alone", () => {
  const before = block({ id: "before", type: "heading", text: "Top", level: 1, align: "left" });
  const after = block({ id: "after", type: "divider" });

  const combined = combineImageWithText([before, IMAGE, TEXT, after], "img");
  assert.deepEqual(combined.map((b) => b.type), ["heading", "columns", "divider"]);

  const split = splitColumns(combined, combined[1].id);
  assert.deepEqual(split.map((b) => b.type), ["heading", "image", "text", "divider"]);
  assert.equal(split[0].id, "before");
  assert.equal(split[3].id, "after");
});

test("transforms ignore an id that is not there or is the wrong type", () => {
  assert.deepEqual(combineImageWithText([IMAGE, TEXT], "nope"), [IMAGE, TEXT]);
  // Combining targets an image; pointing it at the text block must do nothing.
  assert.deepEqual(combineImageWithText([IMAGE, TEXT], "txt"), [IMAGE, TEXT]);
  assert.deepEqual(splitColumns([IMAGE], "img"), [IMAGE]);
});
