// app/api/admin/courses/cohorts/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getCohortDetail, updateCohort } from "@/lib/courses";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const detail = await getCohortDetail(id);
    if (!detail) return Response.json({ error: "Cohort not found." }, { status: 404 });
    return Response.json(detail);
  } catch (err) {
    console.error("ADMIN_COHORT_DETAIL_ERROR", err);
    return Response.json({ error: "Failed to fetch cohort." }, { status: 500 });
  }
}

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  location: z.enum(["orem", "slc"]).optional(),
  price_cents: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.enum(["open", "full", "completed", "cancelled"]).optional(),
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
    const cohort = await updateCohort(id, parsed.data);
    return Response.json(cohort);
  } catch (err) {
    console.error("ADMIN_COHORT_PATCH_ERROR", err);
    return Response.json({ error: "Failed to update cohort." }, { status: 500 });
  }
}
