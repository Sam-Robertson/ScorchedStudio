import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  caption: z.string().nullable().optional(),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  status: z.enum(["Draft", "In Review", "Approved", "Published"]).optional(),
  scheduled_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const { data: post, error } = await getSupabase()
    .from("social_posts")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("SOCIAL_POSTS_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update post" }, { status: 500 });
  }
  return Response.json(post);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: post } = await getSupabase()
    .from("social_posts")
    .select("media_path")
    .eq("id", id)
    .single();
  if (post?.media_path) {
    await getSupabase().storage.from("social-media").remove([post.media_path]);
  }
  const { error } = await getSupabase().from("social_posts").delete().eq("id", id);
  if (error) {
    console.error("SOCIAL_POSTS_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete post" }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
