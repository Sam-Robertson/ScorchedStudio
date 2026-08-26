import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined)           patch.title           = body.title.trim();
    if (body.location !== undefined)        patch.location        = body.location?.trim() || null;
    if (body.employment_type !== undefined) patch.employment_type = body.employment_type?.trim() || null;
    if (body.description !== undefined)     patch.description     = body.description.trim();
    if (body.is_published !== undefined)    patch.is_published    = body.is_published;

    const sb = getSupabase();
    const { data, error } = await sb
      .from("job_openings")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ jobOpening: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const sb = getSupabase();
    const { error } = await sb.from("job_openings").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
