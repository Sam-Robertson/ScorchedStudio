// lib/marketing/email-stats.ts — server only
//
// Campaign email stats, counted from email_events rather than fetched from
// Resend. Batch send has no per-campaign stats endpoint, so each send is
// tagged with its campaign id and the webhook records what comes back.
import { getSupabase } from "@/lib/supabase";

export type CampaignEmailStats = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  unsubscribed: number;
};

export async function campaignEmailStats(campaignId: string): Promise<CampaignEmailStats> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("email_events")
    .select("event_type,email")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`email stats failed: ${error.message}`);

  const rows = (data ?? []) as { event_type: string; email: string | null }[];

  // Opens and clicks are counted per distinct recipient, not per event. One
  // person opening an email six times is one open, which is what "opened"
  // means to anyone reading the number.
  const distinct = (type: string) =>
    new Set(rows.filter((r) => r.event_type === type).map((r) => r.email)).size;
  const total = (type: string) => rows.filter((r) => r.event_type === type).length;

  // Unsubscribes are not a Resend event here, since the unsubscribe link is
  // ours. Counted from the consent log instead.
  const { count: unsubscribed, error: unsubError } = await sb
    .from("consent_events")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("action", "opt_out")
    .eq("source", "unsubscribe_link");

  if (unsubError) console.error("EMAIL_UNSUB_COUNT_ERROR", unsubError);

  return {
    sent: total("sent"),
    delivered: total("delivered"),
    opened: distinct("opened"),
    clicked: distinct("clicked"),
    bounced: total("bounced"),
    complained: total("complained"),
    failed: total("failed"),
    unsubscribed: unsubscribed ?? 0,
  };
}
