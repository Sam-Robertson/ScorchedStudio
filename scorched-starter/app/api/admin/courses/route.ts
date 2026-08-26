// app/api/admin/courses/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { createCourse, listCourses } from "@/lib/courses";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const courses = await listCourses();
    return Response.json(courses);
  } catch (err) {
    console.error("ADMIN_COURSES_GET_ERROR", err);
    return Response.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}

const curriculumWeekSchema = z.object({
  week: z.number().int().positive(),
  title: z.string().min(1),
  topics: z.array(z.string().min(1)),
});

const createSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().min(1),
  curriculum: z.array(curriculumWeekSchema).default([]),
  default_price_cents: z.number().int().positive(),
  default_capacity: z.number().int().positive(),
  session_count: z.number().int().positive(),
  session_duration_minutes: z.number().int().positive(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const course = await createCourse(parsed.data);
    return Response.json(course, { status: 201 });
  } catch (err) {
    console.error("ADMIN_COURSES_CREATE_ERROR", err);
    return Response.json({ error: "Failed to create course. Check that the slug is unique." }, { status: 500 });
  }
}
