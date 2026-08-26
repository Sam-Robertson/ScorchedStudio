// app/careers/page.tsx
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getSupabase } from "@/lib/supabase";
import type { JobOpeningRecord } from "@/lib/supabase";

export const metadata = {
  title: "Careers | Scorched Studio",
  description: "Job openings at Scorched Studio.",
};

// Openings are admin-managed and change without a deploy.
export const dynamic = "force-dynamic";

async function getPublishedJobOpenings(): Promise<JobOpeningRecord[]> {
  // Fail to an empty list, not a 500 — this page is linked from the global
  // footer, so a query error (e.g. the migration hasn't run yet) shouldn't
  // take down every page on the site. An empty list renders the same
  // "no open positions" copy a real zero-openings state would show.
  try {
    const { data, error } = await getSupabase()
      .from("job_openings")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as JobOpeningRecord[];
  } catch (e) {
    console.error("CAREERS_FETCH_ERROR", e);
    return [];
  }
}

export default async function CareersPage() {
  const openings = await getPublishedJobOpenings();

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 text-center">
        <Container>
          <p className="eyebrow text-brand">Join Us</p>
          <h1 className="h1 font-bold">Careers</h1>
          <p className={`${vulfMono.className} mt-3 text-sm text-neutral-500 max-w-md mx-auto`}>
            We&apos;re always looking for people who love working with their hands and helping others do the same.
          </p>
        </Container>
      </section>

      <section className="mt-10">
        <Container className="max-w-2xl">
          {openings.length === 0 ? (
            <p className="text-center text-sm text-neutral-400 italic">
              No open positions right now — check back soon.
            </p>
          ) : (
            <div className="space-y-4">
              {openings.map((job) => (
                <div key={job.id} className="rounded-2xl border border-black/10 bg-white p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <h2 className="h3 font-bold">{job.title}</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      {job.location && (
                        <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-1 rounded-full bg-neutral-100 text-neutral-600`}>
                          {job.location}
                        </span>
                      )}
                      {job.employment_type && (
                        <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-1 rounded-full bg-neutral-100 text-neutral-600`}>
                          {job.employment_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-neutral-600 whitespace-pre-line">{job.description}</p>
                  <a
                    href="/contact"
                    className="inline-block mt-4 text-sm font-semibold text-brand underline underline-offset-4 hover:opacity-80"
                  >
                    Apply →
                  </a>
                </div>
              ))}
            </div>
          )}
        </Container>
      </section>
    </main>
  );
}
