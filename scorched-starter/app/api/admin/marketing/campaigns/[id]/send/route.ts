// app/api/admin/marketing/campaigns/[id]/send/route.ts
//
// Starts a campaign. Email goes out through Resend's batch endpoint; SMS is
// enqueued and drained by the cron worker over the following hours or days.
//
// Nothing here can reach a real person unless MARKETING_LIVE is exactly "true".
// The response says which mode it ran in so the UI can say so too.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { audienceFor } from "@/lib/marketing/audience";
import { sendCampaignEmails } from "@/lib/marketing/email-send";
import { enqueueSmsCampaign } from "@/lib/marketing/campaign-enqueue";
import { marketingIsLive } from "@/lib/marketing/config";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sb = getSupabase();
  const { data, error } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const campaign = data as CampaignRecord;

  // Only a draft, a scheduled campaign, or a paused one can be started. Sending
  // an already-sent campaign again would mail the whole list twice.
  if (!["draft", "scheduled", "paused"].includes(campaign.status)) {
    return Response.json(
      { error: `This campaign is ${campaign.status} and cannot be sent again.` },
      { status: 409 }
    );
  }

  try {
    if (campaign.channel === "sms") {
      const result = await enqueueSmsCampaign(campaign);
      return Response.json({
        ok: true,
        channel: "sms",
        live: marketingIsLive(),
        ...result,
      });
    }

    const recipients = await audienceFor("email", campaign.segment);
    const result = await sendCampaignEmails(campaign, recipients);

    // Email finishes in one pass, so the campaign is done rather than sending.
    await sb.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);

    return Response.json({ ok: true, channel: "email", live: marketingIsLive(), ...result });
  } catch (err) {
    console.error("CAMPAIGN_SEND_ERROR", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
