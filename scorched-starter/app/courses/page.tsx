// app/courses/page.tsx
import Link from "next/link";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getActiveCourses } from "@/lib/courses";

export const metadata = {
  title: "Courses | Scorched Studio",
  description: "Multi-week woodburning courses at Scorched Studio.",
};

// Always render per-request — course/cohort data changes via the admin
// dashboard and this shouldn't serve a stale build-time snapshot (same
// reasoning as app/memberships/page.tsx).
export const dynamic = "force-dynamic";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function CoursesPage() {
  const courses = await getActiveCourses();

  return (
    <main className="pb-16">
      <section className="pt-6 md:pt-8 pb-3 md:pb-4">
        <Container>
          <p className="eyebrow text-center text-brand">Courses</p>
          <h1 className="h2 text-center font-bold mt-2">Learn to Burn</h1>
          <p className={`${vulfMono.className} text-center mt-3 max-w-xl mx-auto text-[15px] leading-[1.5] text-neutral-600`}>
            Multi-week, small-group courses that take you from first burn to a finished project.
          </p>
        </Container>
      </section>

      <section className="py-6 md:py-8">
        <Container>
          {courses.length === 0 ? (
            <p className={`${vulfMono.className} text-center text-neutral-400`}>
              No courses are open right now, check back soon.
            </p>
          ) : (
            <div className="mx-auto max-w-4xl grid grid-cols-1 gap-6 md:grid-cols-2">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="rounded-3xl border border-green bg-white p-6 shadow-sm flex flex-col hover:border-black/25 transition-colors"
                >
                  <h2 className="h3 font-bold">{course.name}</h2>
                  <p className={`${vulfMono.className} mt-2 text-[14px] leading-[1.5] text-neutral-700 flex-1`}>
                    {course.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-2xl font-bold">{formatCents(course.default_price_cents)}</span>
                    <span className={`${vulfMono.className} text-sm text-brand underline underline-offset-2`}>
                      View course →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>
    </main>
  );
}
