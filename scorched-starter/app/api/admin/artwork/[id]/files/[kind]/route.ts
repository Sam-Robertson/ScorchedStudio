import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { ARTWORK_FILE_CONFIG, isArtworkFileKind, withContractUrl, type ArtworkFileKind } from "@/lib/artwork-files";

// The photo is public, so its row keeps a permanent URL. The contract is
// private, so its row keeps only the path and the response signs a link.
function columns(kind: ArtworkFileKind, path: string | null, publicUrl: string | null, name: string | null) {
  return kind === "image"
    ? { image_url: publicUrl, image_path: path }
    : { contract_path: path, contract_name: name };
}

// Points the record at a file the browser already uploaded through a signed
// URL, replacing and removing any earlier one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, kind } = await params;
  if (!isArtworkFileKind(kind)) return Response.json({ error: "Unknown file kind" }, { status: 404 });
  const cfg = ARTWORK_FILE_CONFIG[kind];

  const { path, fileName } = await req.json();
  if (typeof path !== "string" || !path.startsWith(`${id}/`)) {
    return Response.json({ error: "Missing or invalid path" }, { status: 400 });
  }
  const name = typeof fileName === "string" && fileName.trim() ? fileName.trim().slice(0, 200) : null;

  const sb = getSupabase();
  const { data: existing } = await sb.from("artwork_leases").select("image_path, contract_path").eq("id", id).maybeSingle();
  const oldPath = kind === "image" ? existing?.image_path : existing?.contract_path;
  if (oldPath && oldPath !== path) await sb.storage.from(cfg.bucket).remove([oldPath]);

  const publicUrl = kind === "image" ? sb.storage.from(cfg.bucket).getPublicUrl(path).data.publicUrl : null;
  const { data, error } = await sb
    .from("artwork_leases")
    .update({ ...columns(kind, path, publicUrl, name), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("ARTWORK_FILE_UPDATE_ERROR", kind, error);
    return Response.json({ error: `Failed to attach the ${cfg.label}` }, { status: 500 });
  }
  return Response.json({ artwork: await withContractUrl(data) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, kind } = await params;
  if (!isArtworkFileKind(kind)) return Response.json({ error: "Unknown file kind" }, { status: 404 });
  const cfg = ARTWORK_FILE_CONFIG[kind];

  const sb = getSupabase();
  const { data: row } = await sb.from("artwork_leases").select("image_path, contract_path").eq("id", id).maybeSingle();
  const oldPath = kind === "image" ? row?.image_path : row?.contract_path;
  if (oldPath) await sb.storage.from(cfg.bucket).remove([oldPath]);

  const { data, error } = await sb
    .from("artwork_leases")
    .update({ ...columns(kind, null, null, null), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: `Failed to remove the ${cfg.label}` }, { status: 500 });
  return Response.json({ artwork: await withContractUrl(data) });
}
