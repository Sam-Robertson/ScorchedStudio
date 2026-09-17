// app/api/admin/marketing/campaigns/[id]/test/route.ts
//
// Sends one copy of a campaign to Sam's own address or phone. Uses the same
// template, headers, and STOP-notice handling as a real send, so the test
// actually exercises what recipients would get.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { sendTestEmail } from "@/lib/marketing/email-send";
import { sendblue } from "@/lib/marketing/sendblue";
import { withStopNotice } from "@/lib/marketing/message-rules";
import { normalizePhone } from "@/lib/marketing/phone";
import { marketingIsLive, siteUrl } from "@/lib/marketing/config";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    const { to } = await req.json();
    if (!to?.trim()) return Response.json({ error: "A test address or number is required" }, { status: 400 });

    const { data, error } = await getSupabase().from("campaigns").select("*").eq("id", id).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });

    const campaign = data as CampaignRecord;

    if (campaign.channel === "email") {
      const result = await sendTestEmail(campaign, to.trim());
      return Response.json({ ok: true, channel: "email", live: marketingIsLive(), ...result });
    }

    const phone = normalizePhone(to);
    if (!phone) return Response.json({ error: "That does not look like a phone number." }, { status: 400 });

    const result = await sendblue.send({
      to: phone,
      body: withStopNotice(campaign.body),
      mediaUrl: campaign.media_url,
      statusCallback: `${siteUrl()}/api/webhooks/sendblue`,
    });

    if (!result.ok) {
      return Response.json({ error: result.errorMessage ?? "Test send failed" }, { status: 502 });
    }
    return Response.json({ ok: true, channel: "sms", live: marketingIsLive(), suppressed: result.suppressed });
  } catch (err) {
    console.error("CAMPAIGN_TEST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
