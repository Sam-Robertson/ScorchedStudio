// app/api/admin/comments/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { notifyNewComment, type Board } from "@/lib/board-notify";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

const BOARD_TABLE: Record<Board, { table: string; titleColumn: string }> = {
  operations: { table: "tasks", titleColumn: "name" },
  social: { table: "social_posts", titleColumn: "title" },
};

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const board = searchParams.get("board");
  const entityId = searchParams.get("entityId");

  if (board !== "operations" && board !== "social") {
    return Response.json({ error: "Invalid board" }, { status: 400 });
  }
  if (!entityId) {
    return Response.json({ error: "entityId is required" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .select("*")
    .eq("board", board)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ADMIN_COMMENTS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch comments" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  board: z.enum(["operations", "social"]),
  entity_id: z.string().uuid(),
  author: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { board, entity_id, author, body } = parsed.data;
  const supabase = getSupabase();

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ board, entity_id, author, body })
    .select()
    .single();

  if (error) {
    console.error("ADMIN_COMMENTS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create comment." }, { status: 500 });
  }

  const { table, titleColumn } = BOARD_TABLE[board];
  const { data: entity } = await supabase.from(table).select(titleColumn).eq("id", entity_id).single();
  const entityTitle = (entity as Record<string, string> | null)?.[titleColumn] ?? "a board item";

  try {
    await notifyNewComment({ board, entityTitle, author, body });
  } catch (err) {
    console.error("ADMIN_COMMENTS_NOTIFY_ERROR", err);
  }

  return Response.json(comment, { status: 201 });
}
