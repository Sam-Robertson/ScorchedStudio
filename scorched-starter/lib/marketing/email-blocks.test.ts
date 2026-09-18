// lib/marketing/email-blocks.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMergeTags,
  blocksToPlainText,
  checkDocument,
  createBlock,
  escapeHtml,
  htmlToPlainText,
  mergeTagsUsed,
  parseDocument,
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
