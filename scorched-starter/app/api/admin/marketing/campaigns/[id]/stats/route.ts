// app/api/admin/marketing/campaigns/[id]/stats/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { campaignSmsStats } from "@/lib/marketing/campaign-enqueue";
import { campaignEmailStats } from "@/lib/marketing/email-stats";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const { data, error } = await getSupabase().from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const campaign = data as CampaignRecord;

  try {
    if (campaign.channel === "sms") {
      return Response.json({ channel: "sms", sms: await campaignSmsStats(id) });
    }
    return Response.json({ channel: "email", email: await campaignEmailStats(id) });
  } catch (err) {
    console.error("CAMPAIGN_STATS_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
