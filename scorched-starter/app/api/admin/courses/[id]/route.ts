// app/api/admin/courses/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getCourseBySlug, updateCourse } from "@/lib/courses";
import { getSupabase } from "@/lib/supabase";

const curriculumWeekSchema = z.object({
  week: z.number().int().positive(),
  title: z.string().min(1),
  topics: z.array(z.string().min(1)),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  description: z.string().min(1).optional(),
  curriculum: z.array(curriculumWeekSchema).optional(),
  default_price_cents: z.number().int().positive().optional(),
  default_capacity: z.number().int().positive().optional(),
  session_count: z.number().int().positive().optional(),
  session_duration_minutes: z.number().int().positive().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { data, error } = await getSupabase().from("courses").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("ADMIN_COURSE_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch course" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Course not found" }, { status: 404 });
  return Response.json(data);
}

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

  if (parsed.data.slug) {
    const existing = await getCourseBySlug(parsed.data.slug);
    if (existing && existing.id !== id) {
      return Response.json({ error: "That slug is already in use." }, { status: 409 });
    }
  }

  try {
    const course = await updateCourse(id, parsed.data);
    return Response.json(course);
  } catch (err) {
    console.error("ADMIN_COURSE_PATCH_ERROR", err);
    return Response.json({ error: "Failed to update course." }, { status: 500 });
  }
}
