import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

// Marks a post Approved and permanently removes its media from storage.
// The post record (title, caption, platform, schedule, etc.) is kept.
export async function POST(
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
    const { error: storageError } = await getSupabase()
      .storage
      .from("social-media")
      .remove([post.media_path]);
    if (storageError) console.error("SOCIAL_APPROVE_STORAGE_ERROR", storageError);
  }

  const { data: updated, error } = await getSupabase()
    .from("social_posts")
    .update({
      status: "Approved",
      media_url: null,
      media_path: null,
      media_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("SOCIAL_APPROVE_ERROR", error);
    return Response.json({ error: "Failed to approve post" }, { status: 500 });
  }

  return Response.json(updated);
}
