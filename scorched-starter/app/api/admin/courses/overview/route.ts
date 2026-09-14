// app/api/admin/courses/overview/route.ts
// Cross-course view for the admin Courses page: seat counts for every cohort
// and the newest enrollments, so signups are visible without opening each course.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { listCohortSummaries, listRecentEnrollments } from "@/lib/courses";

const RECENT_LIMIT = 25;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [cohorts, recent] = await Promise.all([
      listCohortSummaries(),
      listRecentEnrollments(RECENT_LIMIT),
    ]);
    return Response.json({ cohorts, recent });
  } catch (err) {
    console.error("ADMIN_COURSES_OVERVIEW_ERROR", err);
    return Response.json({ error: "Failed to fetch course overview" }, { status: 500 });
  }
}
