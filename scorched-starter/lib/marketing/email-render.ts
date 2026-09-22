// lib/marketing/email-render.ts — server only
//
// The single rendering path behind the live preview, the test send, and the
// real send. If these three ever rendered separately, the preview would stop
// being evidence of anything.
//
// The shape is render-once-then-substitute. A campaign is rendered to an HTML
// template holding placeholders, and each recipient's copy is produced by
// string replacement. Re-rendering React for all 540 subscribers to change a
// first name would make send time scale with both list size and block count,
// for no benefit.
import { render } from "@react-email/render";
import { markdownToHtml } from "@/lib/markdown";
import type { CampaignRecord, SubscriberRecord } from "@/lib/supabase";
import BlockEmail, { UNSUBSCRIBE_PLACEHOLDER } from "./BlockEmail";
import MarketingEmail from "./MarketingEmail";
import { BUSINESS_NAME, BUSINESS_POSTAL_ADDRESS } from "./consent-copy";
import {
  applyMergeTags,
  blocksToPlainText,
  escapeHtml,
  parseDocument,
  type EmailBlock,
  type EmailDesign,
} from "./email-blocks";
import { siteUrl } from "./config";
import { unsubscribeUrlFor } from "./email-headers";

export { UNSUBSCRIBE_PLACEHOLDER };

export type RenderedTemplate = {
  subject: string;
  previewText: string | null;
  // Both halves still carry the unsubscribe placeholder and any merge tags.
  // Never send these directly; run them through personalize first.
  html: string;
  text: string;
};

// Bump this whenever scripts/make-email-logo.mjs regenerates the PNG. Gmail
// fetches images through its own proxy and caches them by URL, so a changed
// file at the same address keeps showing the old version for days.
const LOGO_VERSION = "2";

export function logoUrl(): string {
  // A raster copy of the wordmark. The brand asset in public/illustrations is
  // SVG, which Gmail, Outlook, and Yahoo all refuse to render in a message.
  return `${siteUrl()}/email/logo-wordmark.png?v=${LOGO_VERSION}`;
}

// The plain-text footer, mirroring the one BlockEmail renders in HTML. Both
// carry the address and the unsubscribe link, because CAN-SPAM applies to the
// text half of a multipart message just as much as the HTML half.
function footerText(): string {
  return [
    "",
    "---",
    `You are getting this because you asked us to email you about classes, events, and offers at ${BUSINESS_NAME}.`,
    `Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
    `${BUSINESS_NAME}, ${BUSINESS_POSTAL_ADDRESS}`,
  ].join("\n");
}

// Renders a block document. Used by the preview route, which has a document in
// hand but not necessarily a saved campaign.
export async function renderDocument(
  blocks: EmailBlock[],
  design: EmailDesign,
  opts: { subject?: string | null; previewText?: string | null } = {}
): Promise<RenderedTemplate> {
  const element = BlockEmail({
    blocks,
    design,
    previewText: opts.previewText ?? null,
    logoUrl: logoUrl(),
    baseUrl: siteUrl(),
  });

  return {
    subject: opts.subject?.trim() || "",
    previewText: opts.previewText?.trim() || null,
    html: await render(element),
    // Generated from the blocks rather than from the rendered HTML: walking the
    // source gives a readable text email, whereas flattening tables gives a
    // column of orphaned words.
    text: `${blocksToPlainText(blocks)}\n${footerText()}`.trim(),
  };
}

// Renders whatever a campaign row holds.
//
// A campaign written before the builder has blocks IS NULL and still renders
// through the original markdown template. That path is kept rather than
// migrated: rewriting historical drafts into blocks would change what a sent
// campaign looked like, and there is no reason to touch them.
export async function renderCampaign(campaign: CampaignRecord): Promise<RenderedTemplate> {
  if (campaign.blocks) {
    const doc = parseDocument(campaign.blocks, campaign.design);
    return renderDocument(doc.blocks, doc.design, {
      subject: campaign.subject,
      previewText: campaign.preview_text,
    });
  }

  const bodyHtml = await markdownToHtml(campaign.body);
  const element = MarketingEmail({
    heading: campaign.subject,
    bodyHtml,
    unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER,
  });

  return {
    subject: campaign.subject ?? campaign.name,
    previewText: campaign.preview_text ?? null,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

export type PersonalizeTarget = {
  firstName?: string | null;
  lastName?: string | null;
  unsubscribeUrl: string;
};

// Turns a rendered template into one person's copy.
//
// The two halves get different escaping. A name landing in HTML has to be
// escaped or a subscriber called `<script>` would inject markup into the
// message; the same name in the text half must not be, or it would read as
// "&lt;script&gt;".
export function personalize(
  template: RenderedTemplate,
  target: PersonalizeTarget
): { subject: string; html: string; text: string } {
  const values = { firstName: target.firstName, lastName: target.lastName };

  return {
    subject: applyMergeTags(template.subject, values),
    html: applyMergeTags(template.html, values, escapeHtml).split(UNSUBSCRIBE_PLACEHOLDER).join(target.unsubscribeUrl),
    text: applyMergeTags(template.text, values).split(UNSUBSCRIBE_PLACEHOLDER).join(target.unsubscribeUrl),
  };
}

export function personalizeFor(template: RenderedTemplate, subscriber: SubscriberRecord) {
  return personalize(template, {
    firstName: subscriber.first_name,
    lastName: subscriber.last_name,
    unsubscribeUrl: unsubscribeUrlFor(subscriber.unsubscribe_token),
  });
}
