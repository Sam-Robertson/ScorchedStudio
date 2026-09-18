// app/api/admin/marketing/campaigns/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord } from "@/lib/supabase";
import { audienceCount } from "@/lib/marketing/audience";
import { validateSmsBody } from "@/lib/marketing/message-rules";
import { smsCostPerSegment } from "@/lib/marketing/config";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const countFor = url.searchParams.get("countFor");

  // Live recipient count for the composer, produced by the same query that
  // decides who actually gets the message.
  if (countFor === "preview") {
    const channel = url.searchParams.get("channel") === "sms" ? "sms" : "email";
    const tags = (url.searchParams.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const match = url.searchParams.get("match") === "all" ? "all" : "any";
    try {
      const count = await audienceCount(channel, { tags, match });
      // Handed back with the count so the composer can price the send without
      // the rate being duplicated client side.
      return Response.json({ count, costPerSegment: smsCostPerSegment() });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "count failed" }, { status: 500 });
    }
  }

  const { data, error } = await getSupabase()
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ campaigns: data as CampaignRecord[] });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { channel, name, subject, body, mediaUrl, segment } = await req.json();

    if (channel !== "email" && channel !== "sms") {
      return Response.json({ error: "channel must be email or sms" }, { status: 400 });
    }
    if (!name?.trim() || !body?.trim()) {
      return Response.json({ error: "Name and body are required" }, { status: 400 });
    }
    if (channel === "email" && !subject?.trim()) {
      return Response.json({ error: "Email campaigns need a subject" }, { status: 400 });
    }
    if (channel === "sms") {
      // Blocks a draft that would break carrier rules before it can be sent.
      const errors = validateSmsBody(body).filter((i) => i.level === "error");
      if (errors.length > 0) {
        return Response.json({ error: errors.map((e) => e.message).join(" ") }, { status: 400 });
      }
    }

    const { data, error } = await getSupabase()
      .from("campaigns")
      .insert({
        channel,
        name: name.trim(),
        subject: subject?.trim() || null,
        body: body.trim(),
        media_url: channel === "sms" ? mediaUrl?.trim() || null : null,
        segment: segment ?? {},
        created_by: session.role,
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ campaign: data as CampaignRecord });
  } catch (err) {
    console.error("CAMPAIGN_CREATE_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
