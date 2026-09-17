// app/api/admin/marketing/campaigns/[id]/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord, CampaignStatus } from "@/lib/supabase";
import { validateSmsBody } from "@/lib/marketing/message-rules";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const { data, error } = await getSupabase().from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ campaign: data as CampaignRecord });
}

// Edits a draft, or changes status for pause, resume, cancel, and schedule.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    const patch = await req.json();
    const sb = getSupabase();

    const { data: existing } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const campaign = existing as CampaignRecord;

    const update: Record<string, unknown> = {};

    // Content is only editable while the campaign has not started. Once it is
    // sending, half the list already has the old wording and changing it would
    // make the two halves differ.
    if (patch.name !== undefined || patch.subject !== undefined || patch.body !== undefined) {
      if (campaign.status !== "draft" && campaign.status !== "scheduled") {
        return Response.json(
          { error: "This campaign has already started sending, so its content is locked." },
          { status: 409 }
        );
      }
      if (patch.name !== undefined) update.name = String(patch.name).trim();
      if (patch.subject !== undefined) update.subject = String(patch.subject).trim() || null;
      if (patch.body !== undefined) {
        const body = String(patch.body).trim();
        if (campaign.channel === "sms") {
          const errors = validateSmsBody(body).filter((i) => i.level === "error");
          if (errors.length > 0) {
            return Response.json({ error: errors.map((e) => e.message).join(" ") }, { status: 400 });
          }
        }
        update.body = body;
      }
    }

    if (patch.segment !== undefined) update.segment = patch.segment;
    if (patch.scheduledFor !== undefined) update.scheduled_for = patch.scheduledFor || null;

    if (patch.status !== undefined) {
      const allowed: CampaignStatus[] = ["draft", "scheduled", "sending", "paused", "cancelled"];
      if (!allowed.includes(patch.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      // Pausing or cancelling takes effect on the worker's next run: its claim
      // only picks up rows whose campaign is 'sending'. Nothing else to undo.
      update.status = patch.status;
    }

    const { data, error } = await sb.from("campaigns").update(update).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ campaign: data as CampaignRecord });
  } catch (err) {
    console.error("CAMPAIGN_PATCH_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sb = getSupabase();
  const { data } = await sb.from("campaigns").select("status").eq("id", id).maybeSingle();
  // Deleting a campaign that has started would take its queue and its stats
  // with it, so only untouched drafts can go.
  if (data && data.status !== "draft") {
    return Response.json({ error: "Only a draft can be deleted. Cancel it instead." }, { status: 409 });
  }

  const { error } = await sb.from("campaigns").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
