// app/api/admin/marketing/campaigns/[id]/resend-missed/route.ts
//
// Finishes a partial send. GET says who would get it; POST sends to them.
//
// Only for an email campaign already marked sent. SMS has its own queue that
// retries on its own, and a draft has not been sent at all. The recipient
// list is the current audience minus everyone with a provider event, so
// anyone who unsubscribed since the first attempt is left alone and nobody
// who got it gets it twice.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { audienceFor } from "@/lib/marketing/audience";
import { sendCampaignEmails } from "@/lib/marketing/email-send";
import { marketingIsLive } from "@/lib/marketing/config";
import { ACCEPTED_EVENT_TYPES, missedRecipients } from "@/lib/marketing/resend-missed";

type Ctx = { params: Promise<{ id: string }> };

async function plan(id: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 404 as const, error: "Not found" };

  const campaign = data as CampaignRecord;
  if (campaign.channel !== "email") {
    return { status: 400 as const, error: "Only email campaigns can be resent this way." };
  }
  if (campaign.status !== "sent") {
    return { status: 409 as const, error: `This campaign is ${campaign.status}, not sent.` };
  }

  const [audience, { data: events, error: eventsError }] = await Promise.all([
    audienceFor("email", campaign.segment),
    sb
      .from("email_events")
      .select("email")
      .eq("campaign_id", id)
      .in("event_type", [...ACCEPTED_EVENT_TYPES])
      .not("email", "is", null)
      .limit(50000),
  ]);
  if (eventsError) throw new Error(eventsError.message);

  const accepted = new Set((events ?? []).map((e) => String(e.email).toLowerCase()));
  const missed = missedRecipients(audience, accepted);
  return { status: 200 as const, campaign, audience: audience.length, accepted: accepted.size, missed };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const p = await plan(id);
    if (p.status !== 200) return Response.json({ error: p.error }, { status: p.status });
    return Response.json({
      audience: p.audience,
      accepted: p.accepted,
      missed: p.missed.length,
      live: marketingIsLive(),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const p = await plan(id);
    if (p.status !== 200) return Response.json({ error: p.error }, { status: p.status });
    if (p.missed.length === 0) {
      return Response.json({ ok: true, audience: p.audience, accepted: p.accepted, missed: 0, sent: 0, failed: 0, live: marketingIsLive() });
    }
    const result = await sendCampaignEmails(p.campaign, p.missed);
    return Response.json({
      ok: true,
      audience: p.audience,
      accepted: p.accepted,
      missed: p.missed.length,
      live: marketingIsLive(),
      ...result,
    });
  } catch (err) {
    console.error("RESEND_MISSED_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
