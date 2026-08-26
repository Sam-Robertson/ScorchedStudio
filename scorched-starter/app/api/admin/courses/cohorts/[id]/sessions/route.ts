// app/api/admin/courses/cohorts/[id]/sessions/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { createSession } from "@/lib/courses";

const createSchema = z.object({
  session_number: z.number().int().positive(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const session = await createSession({ cohort_id: id, ...parsed.data });
    return Response.json(session, { status: 201 });
  } catch (err) {
    console.error("ADMIN_COHORT_SESSION_CREATE_ERROR", err);
    return Response.json(
      { error: "Failed to create session. Check that the session number isn't already used." },
      { status: 500 }
    );
  }
}
