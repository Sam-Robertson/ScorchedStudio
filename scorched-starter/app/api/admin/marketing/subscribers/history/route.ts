// app/api/admin/marketing/subscribers/history/route.ts
//
// The raw material for the subscribers-over-time charts: every consent state
// change, and every campaign that actually went out with when and to how many.
// Aggregation happens in the browser (lib/marketing/subscriber-history.ts) so
// changing the range or bucket size never refetches.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord, MarketingChannel } from "@/lib/supabase";
import type { HistoryEvent, SentCampaign } from "@/lib/marketing/subscriber-history";

// Comfortably above the list today. If it is ever hit, the oldest events fall
// off, which only shifts the starting count of the earliest days.
const EVENT_LIMIT = 20000;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sb = getSupabase();

    const [{ data: events, error: eventsError }, { data: campaigns, error: campaignsError }] =
      await Promise.all([
        sb
          .from("consent_events")
          .select("subscriber_id,channel,action,occurred_at")
          .order("occurred_at", { ascending: true })
          .limit(EVENT_LIMIT),
        sb
          .from("campaigns")
          .select("id,name,channel,status,updated_at")
          .in("status", ["sent", "sending", "paused", "cancelled"]),
      ]);
    if (eventsError) throw new Error(eventsError.message);
    if (campaignsError) throw new Error(campaignsError.message);

    const started = (campaigns ?? []) as Pick<
      CampaignRecord,
      "id" | "name" | "channel" | "status" | "updated_at"
    >[];
    const ids = started.map((c) => c.id);

    // When each campaign went out, and to how many. The campaign row itself
    // has no sent_at, but the first provider event (email) or the enqueue
    // (SMS) is the moment it left, and counting those rows is the audience.
    const [{ data: emailRows }, { data: smsRows }] = ids.length
      ? await Promise.all([
          sb
            .from("email_events")
            .select("campaign_id,created_at")
            .eq("event_type", "sent")
            .in("campaign_id", ids)
            .limit(50000),
          sb.from("sms_queue").select("campaign_id,created_at").in("campaign_id", ids).limit(50000),
        ])
      : [{ data: [] }, { data: [] }];

    const firstAt = new Map<string, string>();
    const count = new Map<string, number>();
    for (const r of [...(emailRows ?? []), ...(smsRows ?? [])] as {
      campaign_id: string;
      created_at: string;
    }[]) {
      count.set(r.campaign_id, (count.get(r.campaign_id) ?? 0) + 1);
      const prev = firstAt.get(r.campaign_id);
      if (!prev || r.created_at < prev) firstAt.set(r.campaign_id, r.created_at);
    }

    const sent: SentCampaign[] = started
      // A cancelled campaign only counts if it had started; one cancelled
      // from 'scheduled' never reached anyone.
      .filter((c) => c.status !== "cancelled" || count.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel as MarketingChannel,
        sentAt: firstAt.get(c.id) ?? c.updated_at,
        recipients: count.get(c.id) ?? 0,
      }));

    return Response.json({ events: (events ?? []) as HistoryEvent[], campaigns: sent });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not load history" },
      { status: 500 }
    );
  }
}
