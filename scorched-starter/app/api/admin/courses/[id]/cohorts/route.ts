// app/api/admin/courses/[id]/cohorts/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { createCohort, getCohortsForCourse } from "@/lib/courses";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const cohorts = await getCohortsForCourse(id);
    return Response.json(cohorts);
  } catch (err) {
    console.error("ADMIN_COURSE_COHORTS_GET_ERROR", err);
    return Response.json({ error: "Failed to fetch cohorts" }, { status: 500 });
  }
}

const createSchema = z.object({
  label: z.string().min(1),
  location: z.enum(["orem", "slc"]),
  price_cents: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.enum(["open", "full", "completed", "cancelled"]).default("open"),
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

  const { data: course, error: courseError } = await getSupabase()
    .from("courses")
    .select("default_price_cents, default_capacity")
    .eq("id", id)
    .maybeSingle();
  if (courseError || !course) {
    return Response.json({ error: "Course not found." }, { status: 404 });
  }

  try {
    const cohort = await createCohort({
      course_id: id,
      label: parsed.data.label,
      location: parsed.data.location,
      price_cents: parsed.data.price_cents ?? course.default_price_cents,
      capacity: parsed.data.capacity ?? course.default_capacity,
      status: parsed.data.status,
    });
    return Response.json(cohort, { status: 201 });
  } catch (err) {
    console.error("ADMIN_COURSE_COHORT_CREATE_ERROR", err);
    return Response.json({ error: "Failed to create cohort." }, { status: 500 });
  }
}
