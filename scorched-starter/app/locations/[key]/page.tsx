// app/locations/[key]/page.tsx
import { notFound } from "next/navigation";
import { Fragment } from "react";
import Link from "next/link";
import Container from "@/components/ui/Container";
import Pricing from "@/components/sections/Pricing";
import { vulfMono } from "@/app/fonts";
import {
  getLocationByKey,
  getPublicBusinessHours,
  DAY_LABELS,
  formatClockTime,
} from "@/lib/locations";

// Location/hours data changes via the admin dashboard — same reasoning as
// app/courses/page.tsx for not serving a stale build-time snapshot.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const location = await getLocationByKey(key);
  if (!location) return { title: "Studio Locations | Scorched Studio" };
  return {
    title: `${location.name} | Scorched Studio`,
    description: `Hours, pricing, and contact info for the Scorched Studio ${location.name} location.`,
  };
}

export default async function LocationPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const location = await getLocationByKey(key);
  if (!location) notFound();

  const hours = location.is_bookable ? await getPublicBusinessHours(location.key) : [];
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);

  return (
    <main className="pb-20">
      <section className="pt-8">
        <Container>
          <Link
            href="/locations"
            className={`${vulfMono.className} text-xs text-neutral-400 hover:text-neutral-700`}
          >
            ← All Locations
          </Link>
        </Container>
      </section>

      {location.is_bookable ? (
        <section className="mt-4 py-14 bg-green text-white">
          <Container>
            <h1 className="text-4xl font-extrabold text-center mb-8">{location.name}</h1>

            {sorted.length > 0 && (
              <div className="grid grid-cols-2 max-w-lg mx-auto text-xl font-semibold gap-y-3">
                {sorted.map((d) => (
                  <Fragment key={d.weekday}>
                    <div>{DAY_LABELS[d.weekday]}</div>
                    <div className="text-right">
                      {d.is_open ? `${formatClockTime(d.open_time)} – ${formatClockTime(d.close_time)}` : "Closed"}
                    </div>
                  </Fragment>
                ))}
              </div>
            )}

            <div className="mt-12 text-center space-y-2">
              {location.address && <div className="text-2xl font-extrabold">{location.address}</div>}
              {location.phone && (
                <a
                  href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
                  className="block text-xl opacity-90 underline-offset-4 hover:underline"
                >
                  {location.phone}
                </a>
              )}
              {location.address && (
                <a
                  href={`https://maps.apple.com/?q=${encodeURIComponent(location.address)}`}
                  target="_blank"
                  className="inline-block mt-6 px-8 py-3 rounded-full bg-white text-black font-extrabold tracking-wide"
                >
                  DIRECTIONS
                </a>
              )}
            </div>
          </Container>
        </section>
      ) : (
        <section className="mt-4 py-16 bg-black text-white">
          <Container>
            <div className="text-center">
              <p className={`${vulfMono.className} text-xs tracking-[0.2em] opacity-70 mb-2`}>COMING SOON</p>
              <h1 className="text-4xl font-extrabold">{location.name}</h1>
              {location.opening_estimate && (
                <p className={`${vulfMono.className} mt-3 text-sm tracking-[0.1em] uppercase text-white/70`}>
                  Expected to open {location.opening_estimate}
                </p>
              )}
              <p className="mt-4 text-lg opacity-80 max-w-md mx-auto">
                We&apos;re opening a new studio here soon — check back for hours, pricing, and booking.
              </p>
            </div>
          </Container>
        </section>
      )}

      {location.is_bookable && (
        <div className="mt-14">
          <Pricing />
        </div>
      )}
    </main>
  );
}
