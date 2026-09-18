// app/api/admin/marketing/consent/route.ts — per-subscriber consent history.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { ConsentEventRecord } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const subscriberId = new URL(req.url).searchParams.get("subscriberId");
  if (!subscriberId) return Response.json({ error: "subscriberId is required" }, { status: 400 });

  const { data, error } = await getSupabase()
    .from("consent_events")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .order("occurred_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data as ConsentEventRecord[] });
}
