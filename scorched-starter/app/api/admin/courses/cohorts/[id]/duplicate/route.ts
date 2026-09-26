// app/api/admin/courses/cohorts/[id]/duplicate/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { duplicateCohort } from "@/lib/courses";

const duplicateSchema = z.object({
  label: z.string().min(1),
  first_session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const raw = await req.json();
  const parsed = duplicateSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await duplicateCohort(id, parsed.data);
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Cohort not found.") {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error("ADMIN_COHORT_DUPLICATE_ERROR", err);
    return Response.json({ error: "Failed to duplicate cohort." }, { status: 500 });
  }
}
