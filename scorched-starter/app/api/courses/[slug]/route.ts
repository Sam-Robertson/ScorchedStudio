// app/api/courses/[slug]/route.ts — public
import { NextRequest } from "next/server";
import {
  getAvailabilityForCohorts,
  getCohortsForCourse,
  getCourseBySlug,
  getSessionsForCohort,
} from "@/lib/courses";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const course = await getCourseBySlug(slug);
    if (!course || course.status !== "active") {
      return Response.json({ error: "Course not found." }, { status: 404 });
    }

    const cohorts = await getCohortsForCourse(course.id);
    const visibleCohorts = cohorts.filter((c) => c.status !== "cancelled");

    const [sessionsByCohort, availability] = await Promise.all([
      Promise.all(visibleCohorts.map((c) => getSessionsForCohort(c.id))),
      getAvailabilityForCohorts(visibleCohorts.map((c) => c.id)),
    ]);

    const cohortsWithDetail = visibleCohorts.map((cohort, i) => ({
      ...cohort,
      sessions: sessionsByCohort[i],
      availability: availability.find((a) => a.cohort_id === cohort.id) ?? null,
    }));

    return Response.json({ course, cohorts: cohortsWithDetail });
  } catch (err) {
    console.error("COURSE_DETAIL_ERROR", slug, err);
    return Response.json({ error: "Failed to load course." }, { status: 500 });
  }
}
