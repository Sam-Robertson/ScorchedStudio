// app/locations/page.tsx — directory linking to each location's own page.
import Link from "next/link";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getLocations } from "@/lib/locations";

export const metadata = {
  title: "Studio Locations | Scorched Studio",
  description: "Find a Scorched Studio location near you.",
};

// Location data changes via the admin dashboard — same reasoning as
// app/courses/page.tsx for not serving a stale build-time snapshot.
export const dynamic = "force-dynamic";

export default async function LocationsIndexPage() {
  const locations = await getLocations();

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 text-center">
        <Container>
          <p className="eyebrow text-brand">Visit Us</p>
          <h1 className="h1 font-bold">Studio Locations</h1>
        </Container>
      </section>

      <section className="mt-10">
        <Container className="max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {locations.map((loc) => (
              <Link
                key={loc.key}
                href={`/locations/${loc.key}`}
                className="rounded-2xl border border-black/10 bg-white p-8 text-center hover:border-black/30 transition-colors"
              >
                <h2 className="h3 font-bold">{loc.name}</h2>
                <p
                  className={`${vulfMono.className} mt-2 text-xs tracking-[0.15em] uppercase ${
                    loc.is_bookable ? "text-[#519A70]" : "text-neutral-400"
                  }`}
                >
                  {loc.is_bookable
                    ? "Open Now"
                    : loc.opening_estimate
                      ? `Coming ${loc.opening_estimate}`
                      : "Coming Soon"}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
