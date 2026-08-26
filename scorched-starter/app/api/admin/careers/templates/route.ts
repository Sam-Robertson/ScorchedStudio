import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("job_templates").select("*").order("name", { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ templates: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { name, title, location, employment_type, pay, description } = await req.json();
    if (!name || !title || !description) {
      return Response.json({ error: "Name, title, and description are required" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("job_templates")
      .insert({
        name: name.trim(),
        title: title.trim(),
        location: location?.trim() || null,
        employment_type: employment_type?.trim() || null,
        pay: pay?.trim() || null,
        description: description.trim(),
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ template: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
