// app/api/admin/marketing/campaigns/[id]/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord, CampaignStatus } from "@/lib/supabase";
import { validateSmsBody } from "@/lib/marketing/message-rules";
import { checkSchedule } from "@/lib/marketing/schedule";
import { normalizeDocument, DocumentError } from "@/lib/marketing/email-document";
import { markdownToHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const { data, error } = await getSupabase().from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  const campaign = data as CampaignRecord;

  // A campaign written before the builder holds markdown in `body` and nothing
  // in `blocks`. The editor needs that copy as HTML so it can seed a text
  // block from it, rather than opening blank and overwriting the original on
  // the first keystroke.
  const legacyHtml =
    campaign.channel === "email" && !campaign.blocks && campaign.body.trim()
      ? await markdownToHtml(campaign.body)
      : null;

  return Response.json({ campaign, legacyHtml });
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
    const touchesContent =
      patch.name !== undefined ||
      patch.subject !== undefined ||
      patch.body !== undefined ||
      patch.blocks !== undefined ||
      patch.design !== undefined ||
      patch.previewText !== undefined;

    if (touchesContent) {
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

      // The block document. Saved through normalizeDocument so the rich-text
      // HTML is sanitized and the plain-text half is regenerated from the same
      // blocks, rather than drifting from whatever the body column held.
      if (patch.blocks !== undefined || patch.design !== undefined) {
        if (campaign.channel !== "email") {
          return Response.json(
            { error: "Only email campaigns have a block layout." },
            { status: 400 }
          );
        }
        const doc = normalizeDocument(
          patch.blocks !== undefined ? patch.blocks : campaign.blocks,
          patch.design !== undefined ? patch.design : campaign.design
        );
        update.blocks = doc.blocks;
        update.design = doc.design;
        update.body = doc.plainText;
      }

      if (patch.previewText !== undefined) {
        update.preview_text = String(patch.previewText).trim() || null;
      }

      // The email subject constraint is NOT NULL, so an email draft clearing
      // its subject stores an empty string rather than null.
      if (patch.subject !== undefined && campaign.channel === "email") {
        update.subject = String(patch.subject).trim();
      }
    }

    if (patch.segment !== undefined) update.segment = patch.segment;
    if (patch.scheduledFor !== undefined) update.scheduled_for = patch.scheduledFor || null;

    if (patch.status !== undefined) {
      const allowed: CampaignStatus[] = ["draft", "scheduled", "sending", "paused", "cancelled"];
      if (!allowed.includes(patch.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }

      // Scheduling is the one status change with a precondition: the time has
      // to exist and be in the future, or the cron would fire it immediately
      // and "schedule" would silently mean "send now".
      if (patch.status === "scheduled") {
        const when =
          patch.scheduledFor !== undefined ? patch.scheduledFor : campaign.scheduled_for;
        const check = checkSchedule(campaign.status, when);
        if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
        update.scheduled_for = check.at.toISOString();
      }

      // Taking a campaign back to draft is how a schedule is undone, so the
      // time goes with it rather than lingering to confuse the next edit.
      if (patch.status === "draft") update.scheduled_for = null;

      // Pausing or cancelling takes effect on the worker's next run: its claim
      // only picks up rows whose campaign is 'sending'. Nothing else to undo.
      update.status = patch.status;
    }

    const { data, error } = await sb.from("campaigns").update(update).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ campaign: data as CampaignRecord });
  } catch (err) {
    if (err instanceof DocumentError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
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
