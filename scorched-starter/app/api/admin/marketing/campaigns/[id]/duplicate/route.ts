// app/api/admin/marketing/campaigns/[id]/duplicate/route.ts
//
// Copies a campaign into a fresh draft. The usual reason is that last month's
// newsletter is the best starting point for this month's.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sb = getSupabase();
  const { data: source, error: readError } = await sb
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const original = source as CampaignRecord;

  const { data, error } = await sb
    .from("campaigns")
    .insert({
      channel: original.channel,
      name: `${original.name} (copy)`,
      subject: original.subject,
      body: original.body,
      blocks: original.blocks,
      design: original.design,
      preview_text: original.preview_text,
      media_url: original.media_url,
      // Content and audience carry over. Status, schedule, and stats do not:
      // the copy is a new draft that has never been sent to anyone.
      segment: original.segment,
      created_by: session.role,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ campaign: data as CampaignRecord });
}
