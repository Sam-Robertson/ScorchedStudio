import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // must match the artwork-images bucket's file_size_limit

// Issues a signed Supabase Storage upload URL so the browser sends the photo
// straight to storage, the same way the social board handles media.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { fileName, fileType, fileSize } = await req.json();
  if (!fileName || !fileType || typeof fileSize !== "number") {
    return Response.json({ error: "Missing fileName, fileType, or fileSize" }, { status: 400 });
  }
  if (!fileType.startsWith("image/")) {
    return Response.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (fileSize > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File is too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max size is 10MB.` },
      { status: 400 }
    );
  }

  const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${id}/${Date.now()}.${ext}`;
  const { data, error } = await getSupabase().storage.from("artwork-images").createSignedUploadUrl(path);
  if (error) {
    console.error("ARTWORK_IMAGE_SIGN_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ signedUrl: data.signedUrl, path });
}
