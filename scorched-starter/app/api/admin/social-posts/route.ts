import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabase()
    .from("social_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("SOCIAL_POSTS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
  return Response.json(data);
}

const createSchema = z.object({
  title: z.string().min(1),
  caption: z.string().nullable().optional(),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  status: z.enum(["Draft", "In Review", "Approved", "Published"]).default("Draft"),
  scheduled_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const { data: post, error } = await getSupabase()
    .from("social_posts")
    .insert(parsed.data)
    .select()
    .single();
  if (error) {
    console.error("SOCIAL_POSTS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create post" }, { status: 500 });
  }
  return Response.json(post, { status: 201 });
}
