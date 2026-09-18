// lib/marketing/email-blocks.ts
//
// The content model for block-based marketing emails: block types, the global
// design tokens, zod validation, merge tags, and plain-text generation.
//
// Deliberately free of JSX and of any "@/" import. The test runner is
// `node --experimental-strip-types`, which cannot parse JSX and cannot resolve
// the path alias, so everything worth testing lives here and the React Email
// components import from it rather than the other way around.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

// A short list on purpose. Every value here has to survive Outlook, which
// ignores most of CSS, so the safe surface is colors, a font stack, and a
// content width.
export const designSchema = z.object({
  backgroundColor: z.string().default("#F1EFEA"),
  contentBackgroundColor: z.string().default("#FFFFFF"),
  textColor: z.string().default("#3A3A3A"),
  headingColor: z.string().default("#3A3A3A"),
  linkColor: z.string().default("#884A20"),
  buttonColor: z.string().default("#884A20"),
  buttonTextColor: z.string().default("#FFFFFF"),
  // Web fonts do not load in most email clients, so this is a stack of things
  // already on the device rather than a font we would have to serve.
  fontFamily: z
    .enum(["sans", "serif", "mono"])
    .default("sans"),
  contentWidth: z.number().int().min(480).max(800).default(600),
  showLogo: z.boolean().default(true),
});

export type EmailDesign = z.infer<typeof designSchema>;

export const DEFAULT_DESIGN: EmailDesign = designSchema.parse({});

export const FONT_STACKS: Record<EmailDesign["fontFamily"], string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const align = z.enum(["left", "center", "right"]);
const spacerSize = z.enum(["sm", "md", "lg"]);

// Every block carries an id so React keys and drag-and-drop stay stable across
// a reorder. Generated client side; never meaningful to the renderer.
const base = { id: z.string().min(1) };

export const headingBlockSchema = z.object({
  ...base,
  type: z.literal("heading"),
  text: z.string().default(""),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  align: align.default("left"),
});

export const textBlockSchema = z.object({
  ...base,
  type: z.literal("text"),
  // HTML produced by the rich-text editor. Sanitized on save by
  // lib/marketing/sanitize-email-html.ts, never trusted as it arrives.
  html: z.string().default(""),
  align: align.default("left"),
});

export const imageBlockSchema = z.object({
  ...base,
  type: z.literal("image"),
  src: z.string().default(""),
  alt: z.string().default(""),
  width: z.enum(["full", "half", "third"]).default("full"),
  align: align.default("center"),
  href: z.string().default(""),
});

export const buttonBlockSchema = z.object({
  ...base,
  type: z.literal("button"),
  label: z.string().default("Click here"),
  href: z.string().default(""),
  align: align.default("center"),
});

export const dividerBlockSchema = z.object({
  ...base,
  type: z.literal("divider"),
});

export const spacerBlockSchema = z.object({
  ...base,
  type: z.literal("spacer"),
  size: spacerSize.default("md"),
});

export const quoteBlockSchema = z.object({
  ...base,
  type: z.literal("quote"),
  text: z.string().default(""),
  attribution: z.string().default(""),
});

// An image beside a paragraph. Renders as a real two-column table on desktop
// and stacks on a phone, which is the one layout worth the extra table markup.
export const columnsBlockSchema = z.object({
  ...base,
  type: z.literal("columns"),
  imageSrc: z.string().default(""),
  imageAlt: z.string().default(""),
  title: z.string().default(""),
  body: z.string().default(""),
  href: z.string().default(""),
  imagePosition: z.enum(["left", "right"]).default("left"),
});

// The studio's most common email: one class, its details, and a book button.
export const cardBlockSchema = z.object({
  ...base,
  type: z.literal("card"),
  imageSrc: z.string().default(""),
  imageAlt: z.string().default(""),
  title: z.string().default(""),
  meta: z.string().default(""),
  body: z.string().default(""),
  buttonLabel: z.string().default("Book a seat"),
  buttonHref: z.string().default(""),
});

export const socialBlockSchema = z.object({
  ...base,
  type: z.literal("social"),
  instagram: z.string().default(""),
  facebook: z.string().default(""),
  website: z.string().default(""),
});

export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  quoteBlockSchema,
  columnsBlockSchema,
  cardBlockSchema,
  socialBlockSchema,
]);

export type EmailBlock = z.infer<typeof blockSchema>;
export type EmailBlockType = EmailBlock["type"];

export const blocksSchema = z.array(blockSchema).max(200);

// The whole document, as stored on the campaign row.
export const emailDocumentSchema = z.object({
  blocks: blocksSchema,
  design: designSchema,
});

export type EmailDocument = z.infer<typeof emailDocumentSchema>;

// Parses whatever came out of jsonb. Unknown or malformed blocks are dropped
// rather than thrown on: a single bad block should not make a campaign
// unopenable in the editor, which is the only place it can be fixed.
export function parseDocument(rawBlocks: unknown, rawDesign: unknown): EmailDocument {
  const design = designSchema.safeParse(rawDesign ?? {});
  const list = Array.isArray(rawBlocks) ? rawBlocks : [];
  const blocks: EmailBlock[] = [];

  for (const candidate of list) {
    const parsed = blockSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
  }

  return {
    blocks,
    design: design.success ? design.data : DEFAULT_DESIGN,
  };
}

// ---------------------------------------------------------------------------
// New blocks
// ---------------------------------------------------------------------------

export const BLOCK_LABELS: Record<EmailBlockType, string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  quote: "Quote",
  columns: "Image and text",
  card: "Class card",
  social: "Social links",
};

// Ordered for the "add a block" menu, commonest first.
export const BLOCK_ORDER: EmailBlockType[] = [
  "text",
  "heading",
  "image",
  "button",
  "card",
  "columns",
  "quote",
  "divider",
  "spacer",
  "social",
];

export function newBlockId(): string {
  // crypto.randomUUID exists in the browser and in Node 19+, which covers both
  // callers. The fallback keeps this usable anywhere else.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(type: EmailBlockType): EmailBlock {
  // Parsing an object with only id and type lets every other field come from
  // the schema defaults, so a default lives in exactly one place.
  return blockSchema.parse({ id: newBlockId(), type }) as EmailBlock;
}

// Turns a pre-builder campaign into blocks.
//
// Campaigns written before the builder hold markdown in `body` and nothing in
// `blocks`. Opening one in the editor has to carry that copy across, or the
// first autosave would regenerate `body` from an empty block array and wipe
// the email. One text block holding the whole thing is the honest conversion:
// guessing at headings and buttons would silently reshape a campaign that has
// already been sent.
export function blocksFromLegacyHtml(bodyHtml: string): EmailBlock[] {
  if (!bodyHtml.trim()) return [];
  return [blockSchema.parse({ id: newBlockId(), type: "text", html: bodyHtml })];
}

// ---------------------------------------------------------------------------
// Merge tags
// ---------------------------------------------------------------------------

export type MergeValues = {
  firstName?: string | null;
  lastName?: string | null;
};

export const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First name", fallback: "there" },
  { tag: "{{last_name}}", label: "Last name", fallback: "" },
] as const;

// Matches {{first_name}} and {{ first_name | friend }}. The optional fallback
// after the pipe is what renders when we do not know that person's name, which
// for an imported list is a large share of it.
const MERGE_PATTERN = /\{\{\s*(first_name|last_name)\s*(?:\|([^}]*))?\s*\}\}/g;

const DEFAULT_FALLBACK: Record<string, string> = {
  first_name: "there",
  last_name: "",
};

// Replaces merge tags in an already-rendered string.
//
// `escape` matters: the same function runs over the HTML half and the text
// half of the message, and a subscriber whose name contains an angle bracket
// would otherwise inject markup into the email.
export function applyMergeTags(
  input: string,
  values: MergeValues,
  escape: (value: string) => string = (v) => v
): string {
  return input.replace(MERGE_PATTERN, (_match, name: string, fallback?: string) => {
    const raw = name === "first_name" ? values.firstName : values.lastName;
    const trimmed = (raw ?? "").trim();
    const chosen = trimmed || (fallback !== undefined ? fallback.trim() : DEFAULT_FALLBACK[name] ?? "");
    return escape(chosen);
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Lists the merge tags a document actually uses, for the pre-send checklist.
export function mergeTagsUsed(blocks: EmailBlock[]): string[] {
  const found = new Set<string>();
  for (const text of textOf(blocks)) {
    let match: RegExpExecArray | null;
    // Fresh regex per string: MERGE_PATTERN is global and carries lastIndex.
    const re = new RegExp(MERGE_PATTERN.source, "g");
    while ((match = re.exec(text)) !== null) found.add(match[1]);
  }
  return Array.from(found);
}

// Every author-entered string in a document, used by the checks above and by
// the link and text scans below.
function textOf(blocks: EmailBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        out.push(block.text);
        break;
      case "text":
        out.push(block.html);
        break;
      case "button":
        out.push(block.label, block.href);
        break;
      case "quote":
        out.push(block.text, block.attribution);
        break;
      case "columns":
        out.push(block.title, block.body, block.href);
        break;
      case "card":
        out.push(block.title, block.meta, block.body, block.buttonLabel, block.buttonHref);
        break;
      case "image":
        out.push(block.alt, block.href);
        break;
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

// Strips the rich-text editor's HTML down to plain text. Block-level tags
// become line breaks first so paragraphs do not run together, and entities are
// decoded last so a literal "&lt;" in the copy survives.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "  - ")
    // [\s\S] rather than the s flag: the test runner targets ES2017.
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The text half of the multipart message.
//
// Generated from the same block array as the HTML rather than written
// separately, so the two halves cannot say different things. A mismatch
// between them is itself a spam signal.
export function blocksToPlainText(blocks: EmailBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(block.text.trim());
        break;
      case "text": {
        const text = htmlToPlainText(block.html);
        if (text) parts.push(text);
        break;
      }
      case "image":
        // An image with no alt text contributes nothing readable, so it is
        // skipped rather than leaving a stray bracket in the text version.
        if (block.alt.trim()) parts.push(`[${block.alt.trim()}]`);
        break;
      case "button":
        if (block.label.trim() || block.href.trim()) {
          parts.push(`${block.label.trim()}: ${block.href.trim()}`.trim());
        }
        break;
      case "divider":
        parts.push("---");
        break;
      case "spacer":
        break;
      case "quote": {
        const quote = block.text.trim();
        if (quote) {
          parts.push(block.attribution.trim() ? `"${quote}"\n  - ${block.attribution.trim()}` : `"${quote}"`);
        }
        break;
      }
      case "columns": {
        const lines = [block.title.trim(), block.body.trim(), block.href.trim()].filter(Boolean);
        if (lines.length) parts.push(lines.join("\n"));
        break;
      }
      case "card": {
        const lines = [
          block.title.trim(),
          block.meta.trim(),
          block.body.trim(),
          block.buttonHref.trim() ? `${block.buttonLabel.trim()}: ${block.buttonHref.trim()}` : "",
        ].filter(Boolean);
        if (lines.length) parts.push(lines.join("\n"));
        break;
      }
      case "social": {
        const links = [
          block.instagram.trim() ? `Instagram: ${block.instagram.trim()}` : "",
          block.facebook.trim() ? `Facebook: ${block.facebook.trim()}` : "",
          block.website.trim() ? block.website.trim() : "",
        ].filter(Boolean);
        if (links.length) parts.push(links.join("\n"));
        break;
      }
    }
  }

  return parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Pre-send checks
// ---------------------------------------------------------------------------

export type CheckLevel = "error" | "warning";

export type DocumentIssue = {
  level: CheckLevel;
  message: string;
  blockId?: string;
};

const HTTP_LINK = /^https?:\/\//i;

// What the pre-send checklist runs. Errors block the send; warnings do not.
//
// The split matters: a missing alt attribute should never stop a campaign
// going out, and a button that links nowhere should always stop it, because
// that one is guaranteed to reach every recipient broken.
export function checkDocument(
  blocks: EmailBlock[],
  opts: { subject?: string | null; previewText?: string | null } = {}
): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  if (!blocks.length) {
    issues.push({ level: "error", message: "This email has no content yet." });
  }
  if (!opts.subject?.trim()) {
    issues.push({ level: "error", message: "Add a subject line." });
  }
  if (opts.subject && opts.subject.trim().length > 90) {
    issues.push({
      level: "warning",
      message: "Subject is long and most inboxes will cut it off around 60 characters.",
    });
  }
  if (!opts.previewText?.trim()) {
    issues.push({
      level: "warning",
      message: "No preview text, so inboxes will show the first line of the email instead.",
    });
  }

  for (const block of blocks) {
    switch (block.type) {
      case "image":
        if (!block.src.trim()) {
          issues.push({ level: "error", message: "An image block has no image.", blockId: block.id });
        }
        if (!block.alt.trim()) {
          issues.push({
            level: "warning",
            message: "An image has no alt text, so it says nothing when images are blocked.",
            blockId: block.id,
          });
        }
        break;
      case "button":
        if (!HTTP_LINK.test(block.href.trim())) {
          issues.push({
            level: "error",
            message: `Button "${block.label || "untitled"}" needs a link starting with http.`,
            blockId: block.id,
          });
        }
        break;
      case "card":
        if (block.buttonLabel.trim() && !HTTP_LINK.test(block.buttonHref.trim())) {
          issues.push({
            level: "error",
            message: `The button on card "${block.title || "untitled"}" needs a link starting with http.`,
            blockId: block.id,
          });
        }
        if (!block.title.trim()) {
          issues.push({ level: "warning", message: "A card has no title.", blockId: block.id });
        }
        break;
      case "columns":
        if (block.href.trim() && !HTTP_LINK.test(block.href.trim())) {
          issues.push({
            level: "error",
            message: "A link on an image-and-text block does not start with http.",
            blockId: block.id,
          });
        }
        break;
      case "heading":
        if (!block.text.trim()) {
          issues.push({ level: "warning", message: "An empty heading block.", blockId: block.id });
        }
        break;
      case "text":
        if (!htmlToPlainText(block.html)) {
          issues.push({ level: "warning", message: "An empty text block.", blockId: block.id });
        }
        break;
      default:
        break;
    }
  }

  return issues;
}
