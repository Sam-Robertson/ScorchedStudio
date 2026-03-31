// app/api/admin/tasks/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabase()
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ADMIN_TASKS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  board_column: z.enum(["To do", "Doing", "Done", "Blocked"]).default("To do"),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  status: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  assignee_email: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  sprint_dates: z.string().nullable().optional(),
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

  const { data: task, error } = await getSupabase()
    .from("tasks")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_TASKS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create task." }, { status: 500 });
  }

  return Response.json(task, { status: 201 });
}
