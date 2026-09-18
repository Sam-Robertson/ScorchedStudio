// app/api/admin/marketing/templates/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("campaign_templates")
    .select("id, slug, name, description, subject, preview_text, blocks, design, is_builtin")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ templates: data ?? [] });
}
