import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

// Points the record at a photo the browser already uploaded through a signed
// URL, replacing and removing any earlier one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { path } = await req.json();
  if (typeof path !== "string" || !path.startsWith(`${id}/`)) {
    return Response.json({ error: "Missing or invalid path" }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: existing } = await sb.from("artwork_leases").select("image_path").eq("id", id).maybeSingle();
  if (existing?.image_path && existing.image_path !== path) {
    await sb.storage.from("artwork-images").remove([existing.image_path]);
  }

  const { data: { publicUrl } } = sb.storage.from("artwork-images").getPublicUrl(path);
  const { data, error } = await sb
    .from("artwork_leases")
    .update({ image_url: publicUrl, image_path: path, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("ARTWORK_IMAGE_UPDATE_ERROR", error);
    return Response.json({ error: "Failed to attach the photo" }, { status: 500 });
  }
  return Response.json({ artwork: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = getSupabase();
  const { data: row } = await sb.from("artwork_leases").select("image_path").eq("id", id).maybeSingle();
  if (row?.image_path) await sb.storage.from("artwork-images").remove([row.image_path]);
  const { data, error } = await sb
    .from("artwork_leases")
    .update({ image_url: null, image_path: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: "Failed to remove the photo" }, { status: 500 });
  return Response.json({ artwork: data });
}
