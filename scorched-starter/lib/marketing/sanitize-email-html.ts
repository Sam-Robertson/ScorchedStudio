// lib/marketing/sanitize-email-html.ts
//
// Cleans the rich-text editor's HTML before it is stored or sent.
//
// This is not optional politeness. The editor's output is author-controlled
// HTML that gets rendered into a message delivered to hundreds of inboxes, and
// pasting from a web page drags in scripts, event handlers, and style blocks.
// The allowlist below is also roughly what email clients actually render, so
// stripping the rest costs nothing visually.
import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    // The editor marks alignment with a style attribute; text-align is the
    // only declaration worth keeping and the only one filtered through below.
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    span: ["style"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  // No javascript: or data: URLs. mailto and tel are genuinely useful in a
  // marketing email, so they stay.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Anything not on the list loses its tag but keeps its text, so pasted
  // content does not silently lose words.
  disallowedTagsMode: "discard",
  transformTags: {
    // Every link in an email opens outside the client anyway, and the rel
    // pair is what stops the target page reaching back through window.opener.
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
