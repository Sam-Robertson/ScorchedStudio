// lib/marketing/scheduled-campaigns.ts — server only
//
// Starts campaigns whose scheduled time has arrived. Without this a scheduled
// campaign sits forever: the SMS worker only claims rows whose campaign is
// already 'sending', and email only goes out from the admin send route.
//
// Run from the same 5 minute cron as the SMS worker rather than a separate
// schedule, so there is one moving part instead of two.
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { audienceFor } from "./audience";
import { sendCampaignEmails } from "./email-send";
import { enqueueSmsCampaign } from "./campaign-enqueue";

export type ScheduledRunResult = {
  started: number;
  failed: number;
  campaigns: { id: string; name: string; channel: string; outcome: string }[];
};

export async function startDueCampaigns(now: Date = new Date()): Promise<ScheduledRunResult> {
  const sb = getSupabase();
  const result: ScheduledRunResult = { started: 0, failed: 0, campaigns: [] };

  const { data, error } = await sb
    .from("campaigns")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", now.toISOString())
    .not("scheduled_for", "is", null);

  if (error) throw new Error(`scheduled lookup failed: ${error.message}`);

  for (const row of (data ?? []) as CampaignRecord[]) {
    try {
      if (row.channel === "sms") {
        // Flips the campaign to 'sending', which is what the worker claims on.
        const enqueued = await enqueueSmsCampaign(row);
        result.campaigns.push({
          id: row.id,
          name: row.name,
          channel: "sms",
          outcome: `queued ${enqueued.queued}`,
        });
      } else {
        const recipients = await audienceFor("email", row.segment);
        const sent = await sendCampaignEmails(row, recipients);
        // A suppressed run is not a send, so the campaign stays schedulable
        // rather than being marked done without anyone receiving it.
        if (!sent.suppressed) {
          await sb.from("campaigns").update({ status: "sent" }).eq("id", row.id);
        }
        result.campaigns.push({
          id: row.id,
          name: row.name,
          channel: "email",
          outcome: sent.suppressed ? "suppressed, left scheduled" : `sent ${sent.sent}/${sent.attempted}`,
        });
      }
      result.started++;
    } catch (err) {
      result.failed++;
      console.error("SCHEDULED_CAMPAIGN_ERROR", { id: row.id, err });
      result.campaigns.push({
        id: row.id,
        name: row.name,
        channel: row.channel,
        outcome: err instanceof Error ? err.message : "failed",
      });
    }
  }

  return result;
}
