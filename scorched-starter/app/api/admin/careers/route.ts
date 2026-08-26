import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("job_openings").select("*").order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ jobOpenings: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { title, location, employment_type, description, is_published } = await req.json();
    if (!title || !description) {
      return Response.json({ error: "Title and description are required" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("job_openings")
      .insert({
        title: title.trim(),
        location: location?.trim() || null,
        employment_type: employment_type?.trim() || null,
        description: description.trim(),
        is_published: is_published ?? true,
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ jobOpening: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
