// app/api/admin/comment-reactions/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

const toggleSchema = z.object({
  comment_id: z.string().uuid(),
  author: z.string().min(1),
  emoji: z.string().min(1).default("👍"),
});

// Toggles the caller's reaction on a comment: adds it if absent, removes it if present.
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { comment_id, author, emoji } = parsed.data;
  const supabase = getSupabase();

  const { data: existing, error: findError } = await supabase
    .from("comment_reactions")
    .select("id")
    .eq("comment_id", comment_id)
    .eq("author", author)
    .eq("emoji", emoji)
    .maybeSingle();

  if (findError) {
    console.error("ADMIN_COMMENT_REACTIONS_FIND_ERROR", findError);
    return Response.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }

  if (existing) {
    const { error: deleteError } = await supabase.from("comment_reactions").delete().eq("id", existing.id);
    if (deleteError) {
      console.error("ADMIN_COMMENT_REACTIONS_DELETE_ERROR", deleteError);
      return Response.json({ error: "Failed to remove reaction" }, { status: 500 });
    }
    return Response.json({ removed: true, comment_id, author, emoji });
  }

  const { error: insertError } = await supabase.from("comment_reactions").insert({ comment_id, author, emoji });
  if (insertError) {
    console.error("ADMIN_COMMENT_REACTIONS_INSERT_ERROR", insertError);
    return Response.json({ error: "Failed to add reaction" }, { status: 500 });
  }

  return Response.json({ removed: false, comment_id, author, emoji }, { status: 201 });
}
