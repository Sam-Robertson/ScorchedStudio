// lib/marketing/email-send.ts — server only
//
// Sends a marketing campaign through Resend's batch endpoint.
//
// Not using Broadcasts: a broadcast targets a whole Resend segment and cannot
// filter by tag, but every campaign here is tag-segmented out of Supabase.
// Batch send lets us keep Supabase as the source of truth and set our own
// List-Unsubscribe headers pointing at our own token route.
import { Resend } from "resend";
import { render } from "@react-email/render";
import { markdownToHtml } from "@/lib/markdown";
import type { CampaignRecord, SubscriberRecord } from "@/lib/supabase";
import MarketingEmail from "./MarketingEmail";
import { marketingFrom, marketingIsLive, logSuppressedSend } from "./config";
import { chunk, unsubscribeHeaders, unsubscribeUrlFor } from "./email-headers";

export { chunk, unsubscribeHeaders, unsubscribeUrlFor };

// Resend accepts up to 100 messages per batch call.
export const BATCH_SIZE = 100;

export type PreparedEmail = {
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
};

// Rendered per recipient, because the unsubscribe link carries that person's
// own token and must never be shared between recipients.
export async function prepareEmails(
  campaign: CampaignRecord,
  recipients: SubscriberRecord[]
): Promise<PreparedEmail[]> {
  const bodyHtml = await markdownToHtml(campaign.body);

  const prepared: PreparedEmail[] = [];
  for (const subscriber of recipients) {
    if (!subscriber.email) continue;
    const html = await render(
      MarketingEmail({
        heading: campaign.subject,
        bodyHtml,
        unsubscribeUrl: unsubscribeUrlFor(subscriber.unsubscribe_token),
      })
    );
    prepared.push({
      to: subscriber.email,
      subject: campaign.subject ?? campaign.name,
      html,
      headers: unsubscribeHeaders(subscriber.unsubscribe_token),
    });
  }
  return prepared;
}

export type EmailSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  suppressed: boolean;
};

export async function sendCampaignEmails(
  campaign: CampaignRecord,
  recipients: SubscriberRecord[]
): Promise<EmailSendResult> {
  const prepared = await prepareEmails(campaign, recipients);

  if (!marketingIsLive()) {
    logSuppressedSend("email-campaign", {
      campaign: campaign.name,
      recipients: prepared.length,
      subject: campaign.subject,
      firstRecipient: prepared[0]?.to ?? null,
    });
    return { attempted: prepared.length, sent: 0, failed: 0, suppressed: true };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  const resend = new Resend(key);
  const from = marketingFrom();

  let sent = 0;
  let failed = 0;

  for (const batch of chunk(prepared, BATCH_SIZE)) {
    try {
      const res = await resend.batch.send(
        batch.map((m) => ({
          from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          headers: m.headers,
          // Resend echoes tags back on every webhook, which is how each
          // delivery event is attributed to a campaign. Batch send has no
          // per-campaign stats endpoint, so without this the admin page could
          // only ever show bounces and complaints.
          tags: [{ name: "campaign_id", value: campaign.id }],
        }))
      );
      if (res.error) {
        failed += batch.length;
        console.error("EMAIL_BATCH_ERROR", res.error);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      failed += batch.length;
      console.error("EMAIL_BATCH_THREW", err);
    }
  }

  return { attempted: prepared.length, sent, failed, suppressed: false };
}

// The admin "send a test to myself" button. Same template and headers as a
// real send so the test actually exercises what recipients will get.
export async function sendTestEmail(
  campaign: CampaignRecord,
  toEmail: string,
  token = "test-token"
): Promise<{ suppressed: boolean }> {
  const bodyHtml = await markdownToHtml(campaign.body);
  const html = await render(
    MarketingEmail({
      heading: campaign.subject,
      bodyHtml,
      unsubscribeUrl: unsubscribeUrlFor(token),
    })
  );

  if (!marketingIsLive()) {
    logSuppressedSend("email-test", { to: toEmail, subject: campaign.subject });
    return { suppressed: true };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");

  await new Resend(key).emails.send({
    from: marketingFrom(),
    to: toEmail,
    subject: `[TEST] ${campaign.subject ?? campaign.name}`,
    html,
    headers: unsubscribeHeaders(token),
  });

  return { suppressed: false };
}
