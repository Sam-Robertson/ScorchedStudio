// app/api/admin/tasks/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  board_column: z.enum(["To do", "Doing", "Done", "Blocked"]).optional(),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  status: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  assignee_email: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  sprint_dates: z.string().nullable().optional(),
  manually_archived: z.boolean().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: task, error } = await getSupabase()
    .from("tasks")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_TASKS_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update task." }, { status: 500 });
  }

  return Response.json(task);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await getSupabase().from("tasks").delete().eq("id", id);

  if (error) {
    console.error("ADMIN_TASKS_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete task." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
