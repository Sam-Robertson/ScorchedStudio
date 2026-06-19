import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Allow larger uploads for video files
export const maxDuration = 60;

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const mediaType = file.type.startsWith("video/") ? "video" : "image";
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${id}/${Date.now()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Remove previous media if any
  const { data: existing } = await getSupabase()
    .from("social_posts")
    .select("media_path")
    .eq("id", id)
    .single();
  if (existing?.media_path) {
    await getSupabase().storage.from("social-media").remove([existing.media_path]);
  }

  const { error: uploadError } = await getSupabase()
    .storage
    .from("social-media")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("SOCIAL_MEDIA_UPLOAD_ERROR", uploadError);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: { publicUrl } } = getSupabase()
    .storage
    .from("social-media")
    .getPublicUrl(path);

  const { data: post, error } = await getSupabase()
    .from("social_posts")
    .update({
      media_url: publicUrl,
      media_path: path,
      media_type: mediaType,
      media_deleted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("SOCIAL_MEDIA_POST_UPDATE_ERROR", error);
    return Response.json({ error: "Failed to update post with media" }, { status: 500 });
  }

  return Response.json(post);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: post } = await getSupabase()
    .from("social_posts")
    .select("media_path")
    .eq("id", id)
    .single();

  if (post?.media_path) {
    await getSupabase().storage.from("social-media").remove([post.media_path]);
  }

  const { data: updated, error } = await getSupabase()
    .from("social_posts")
    .update({
      media_url: null,
      media_path: null,
      media_type: null,
      media_deleted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to remove media" }, { status: 500 });
  return Response.json(updated);
}
