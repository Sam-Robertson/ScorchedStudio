// app/api/courses/route.ts — public
import { getActiveCourses } from "@/lib/courses";

export async function GET() {
  try {
    const courses = await getActiveCourses();
    return Response.json(courses);
  } catch (err) {
    console.error("COURSES_LIST_ERROR", err);
    return Response.json({ error: "Failed to load courses." }, { status: 500 });
  }
}
