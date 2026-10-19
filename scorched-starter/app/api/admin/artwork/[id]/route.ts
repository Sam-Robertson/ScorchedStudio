import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { parseArtworkInput } from "@/lib/artwork";

// The form always sends every field, so an edit is validated as a whole row
// rather than field by field.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const parsed = parseArtworkInput(await req.json());
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await getSupabase()
      .from("artwork_leases")
      .update({ ...parsed.row, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ artwork: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const sb = getSupabase();
    const { data: row } = await sb.from("artwork_leases").select("image_path").eq("id", id).maybeSingle();
    if (row?.image_path) await sb.storage.from("artwork-images").remove([row.image_path]);
    const { error } = await sb.from("artwork_leases").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
