// app/api/admin/courses/sessions/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { deleteSession, updateSession } from "@/lib/courses";

const patchSchema = z.object({
  session_number: z.number().int().positive().optional(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const session = await updateSession(id, parsed.data);
    return Response.json(session);
  } catch (err) {
    console.error("ADMIN_COURSE_SESSION_PATCH_ERROR", err);
    return Response.json({ error: "Failed to update session." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteSession(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("ADMIN_COURSE_SESSION_DELETE_ERROR", err);
    return Response.json({ error: "Failed to delete session." }, { status: 500 });
  }
}
