// lib/marketing/email-document.ts — server only
//
// The one place an incoming block document is made safe to store.
//
// Everything that arrives from the editor passes through here: validated
// against the schema, rich text sanitized, and the plain-text version derived.
// Routes call this rather than writing blocks straight to the column, so a
// second write path cannot skip the sanitizer.
import {
  blocksSchema,
  designSchema,
  blocksToPlainText,
  type EmailBlock,
  type EmailDesign,
} from "./email-blocks";
import { sanitizeEmailHtml } from "./sanitize-email-html";

export type NormalizedDocument = {
  blocks: EmailBlock[];
  design: EmailDesign;
  // campaigns.body is NOT NULL and predates the builder. Rather than filling it
  // with a placeholder, it holds the generated plain-text version: the
  // multipart send needs that text anyway, and a block campaign still reads
  // sensibly in a SQL client.
  plainText: string;
};

export class DocumentError extends Error {}

export function normalizeDocument(rawBlocks: unknown, rawDesign: unknown): NormalizedDocument {
  const parsedBlocks = blocksSchema.safeParse(rawBlocks ?? []);
  if (!parsedBlocks.success) {
    const first = parsedBlocks.error.issues[0];
    throw new DocumentError(
      first ? `Invalid block at ${first.path.join(".") || "root"}: ${first.message}` : "Invalid blocks"
    );
  }

  const parsedDesign = designSchema.safeParse(rawDesign ?? {});
  if (!parsedDesign.success) throw new DocumentError("Invalid design settings");

  const blocks = parsedBlocks.data.map((block) =>
    block.type === "text" ? { ...block, html: sanitizeEmailHtml(block.html) } : block
  );

  return {
    blocks,
    design: parsedDesign.data,
    plainText: blocksToPlainText(blocks),
  };
}
