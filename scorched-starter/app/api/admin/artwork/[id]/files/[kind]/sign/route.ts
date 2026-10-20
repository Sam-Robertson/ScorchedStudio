import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { ARTWORK_FILE_CONFIG, isArtworkFileKind } from "@/lib/artwork-files";

// Issues a signed Supabase Storage upload URL so the browser sends the photo
// or contract straight to storage, the same way the social board handles media.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, kind } = await params;
  if (!isArtworkFileKind(kind)) return Response.json({ error: "Unknown file kind" }, { status: 404 });
  const cfg = ARTWORK_FILE_CONFIG[kind];

  const { fileName, fileType, fileSize } = await req.json();
  if (!fileName || !fileType || typeof fileSize !== "number") {
    return Response.json({ error: "Missing fileName, fileType, or fileSize" }, { status: 400 });
  }
  if (!cfg.accepts(fileType)) {
    return Response.json(
      { error: kind === "image" ? "Only image files are allowed" : "The contract must be a PDF or an image" },
      { status: 400 }
    );
  }
  if (fileSize > cfg.maxBytes) {
    return Response.json(
      { error: `File is too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max size is ${cfg.maxBytes / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }

  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase();
  const path = `${id}/${Date.now()}.${ext}`;
  const { data, error } = await getSupabase().storage.from(cfg.bucket).createSignedUploadUrl(path);
  if (error) {
    console.error("ARTWORK_FILE_SIGN_ERROR", kind, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ signedUrl: data.signedUrl, path });
}
