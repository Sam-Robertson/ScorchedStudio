import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // must match the social-media bucket's file_size_limit

// Issues a signed Supabase Storage upload URL so the browser can upload the
// file directly to storage, bypassing this server's request body limit.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { fileName, fileType, fileSize } = await req.json();
  if (!fileName || !fileType || typeof fileSize !== "number") {
    return Response.json({ error: "Missing fileName, fileType, or fileSize" }, { status: 400 });
  }
  if (!fileType.startsWith("image/") && !fileType.startsWith("video/")) {
    return Response.json({ error: "Only image or video files are allowed" }, { status: 400 });
  }
  if (fileSize > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File is too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max size is 50MB.` },
      { status: 400 }
    );
  }

  const mediaType = fileType.startsWith("video/") ? "video" : "image";
  const ext = fileName.split(".").pop() ?? "bin";
  const path = `${id}/${Date.now()}.${ext}`;

  const { data, error } = await getSupabase()
    .storage
    .from("social-media")
    .createSignedUploadUrl(path);

  if (error) {
    console.error("SOCIAL_MEDIA_SIGN_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ signedUrl: data.signedUrl, path, mediaType });
}
