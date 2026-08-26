// app/courses/[slug]/page.tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import {
  getAvailabilityForCohorts,
  getCohortsForCourse,
  getCourseBySlug,
  getSessionsForCohort,
} from "@/lib/courses";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import CourseCohortPicker from "@/components/courses/CourseCohortPicker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return { title: course ? `${course.name} | Scorched Studio` : "Course | Scorched Studio" };
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { slug } = await params;
  const { cohort: initialCohortId } = await searchParams;
  const course = await getCourseBySlug(slug);
  if (!course || course.status !== "active") notFound();

  const sessionToken = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const customerSession = sessionToken ? verifyCustomerSessionToken(sessionToken) : null;

  const cohorts = (await getCohortsForCourse(course.id)).filter((c) => c.status !== "cancelled");
  const [sessionsByCohort, availability] = await Promise.all([
    Promise.all(cohorts.map((c) => getSessionsForCohort(c.id))),
    getAvailabilityForCohorts(cohorts.map((c) => c.id)),
  ]);

  const cohortsWithDetail = cohorts.map((cohort, i) => ({
    ...cohort,
    sessions: sessionsByCohort[i],
    availability: availability.find((a) => a.cohort_id === cohort.id) ?? null,
  }));

  return (
    <main className="pb-16">
      <section className="pt-6 md:pt-8 pb-3 md:pb-4">
        <Container>
          <p className="eyebrow text-center text-brand">Course</p>
          <h1 className="h2 text-center font-bold mt-2">{course.name}</h1>
          <p className={`${vulfMono.className} text-center mt-3 max-w-xl mx-auto text-[15px] leading-[1.5] text-neutral-600`}>
            {course.description}
          </p>
        </Container>
      </section>

      <section className="py-6">
        <Container className="max-w-3xl">
          <h2 className="h3 font-bold mb-4">Curriculum</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-10">
            {course.curriculum.map((week) => (
              <div key={week.week} className="rounded-xl border border-black/10 bg-white p-3">
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-0.5`}>WEEK {week.week}</p>
                <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">{week.title}</h3>
                <ul className={`${vulfMono.className} text-xs text-neutral-600 list-disc list-inside space-y-0.5`}>
                  {week.topics.map((topic, i) => (
                    <li key={i}>{topic}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {cohortsWithDetail.length === 0 ? (
            <p className={`${vulfMono.className} text-neutral-400`}>No upcoming cohorts are scheduled right now.</p>
          ) : (
            <CourseCohortPicker
              cohorts={cohortsWithDetail}
              initialCohortId={initialCohortId}
              accountEmail={customerSession?.email ?? null}
            />
          )}
        </Container>
      </section>
    </main>
  );
}
