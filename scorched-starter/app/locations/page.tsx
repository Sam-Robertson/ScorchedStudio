// app/locations/page.tsx — one page with a section per location. The old
// per-location routes redirect to the matching anchor here.
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import Container from "@/components/ui/Container";
import Pricing from "@/components/sections/Pricing";
import { vulfMono } from "@/app/fonts";
import {
  getLocations,
  getPublicBusinessHours,
  DAY_LABELS,
  formatClockTime,
  type LocationRecord,
  type PublicDayHours,
} from "@/lib/locations";

export const metadata = {
  title: "Studio Locations | Scorched Studio",
  description: "Hours, address, and booking for every Scorched Studio location.",
};

// Location data changes via the admin dashboard, same reasoning as
// app/courses/page.tsx for not serving a stale build-time snapshot.
export const dynamic = "force-dynamic";

// The locations table has no description column, so the blurbs live here.
// Keyed by location key; a location with no entry simply shows no blurb.
const BLURBS: Record<string, string> = {
  orem: "Our original studio. Walk in, pick a project, and burn it start to finish with help on hand the whole time.",
  slc: "A second studio on the way, with the same walk-in burning, group events, and courses.",
};

// Same idea for photos. Drop a path in here and the section renders it.
const PHOTOS: Record<string, string> = {};

export default async function LocationsPage() {
  const locations = await getLocations();
  const hoursByKey = await Promise.all(
    locations.map((loc) => (loc.is_bookable ? getPublicBusinessHours(loc.key) : Promise.resolve([])))
  );

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 text-center">
        <Container>
          <p className="eyebrow text-brand">Visit Us</p>
          <h1 className="h1 font-bold">Studio Locations</h1>
        </Container>
      </section>

      <section className="mt-10">
        <Container className="max-w-4xl">
          <div className="space-y-8">
            {locations.map((loc, i) => (
              <LocationSection key={loc.key} location={loc} hours={hoursByKey[i]} />
            ))}
          </div>
        </Container>
      </section>

      <div className="mt-14">
        <Pricing />
      </div>
    </main>
  );
}

function LocationSection({ location, hours }: { location: LocationRecord; hours: PublicDayHours[] }) {
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const blurb = BLURBS[location.key];
  const photo = PHOTOS[location.key];

  return (
    // scroll-mt keeps the heading clear of the sticky header when the page is
    // opened at this anchor.
    <section id={location.key} className="scroll-mt-28 rounded-2xl border border-black/10 bg-white overflow-hidden">
      {photo && (
        <div className="relative aspect-[16/7]">
          <Image src={photo} alt={location.name} fill className="object-cover" />
        </div>
      )}

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="h3 font-bold">{location.name}</h2>
          <p
            className={`${vulfMono.className} mt-2 text-xs tracking-[0.15em] uppercase ${
              location.is_bookable ? "text-[#519A70]" : "text-neutral-400"
            }`}
          >
            {location.is_bookable
              ? "Open Now"
              : location.opening_estimate
                ? `Coming ${location.opening_estimate}`
                : "Coming Soon"}
          </p>

          {blurb && <p className="mt-4 text-sm leading-relaxed text-neutral-700">{blurb}</p>}

          {location.address && (
            <p className={`${vulfMono.className} mt-4 text-sm text-neutral-700`}>{location.address}</p>
          )}
          {location.phone && (
            <a
              href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
              className={`${vulfMono.className} block text-sm text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline`}
            >
              {location.phone}
            </a>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {location.is_bookable && (
              <Link
                href={`/book?location=${location.key}`}
                className={`${vulfMono.className} inline-flex items-center justify-center rounded-md px-5 h-9 text-[13px] font-semibold tracking-[0.18em] bg-green text-white hover:opacity-90 transition-opacity`}
              >
                BOOK&nbsp;NOW
              </Link>
            )}
            {location.address && (
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(location.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${vulfMono.className} inline-flex items-center justify-center rounded-md px-5 h-9 text-[13px] font-semibold tracking-[0.18em] border border-black/20 text-neutral-700 hover:border-black/40 transition-colors`}
              >
                DIRECTIONS
              </a>
            )}
          </div>
        </div>

        <div>
          {sorted.length > 0 ? (
            <>
              <p className={`${vulfMono.className} text-[10px] tracking-[0.15em] uppercase text-neutral-400 mb-3`}>
                Hours
              </p>
              <div className={`${vulfMono.className} grid grid-cols-2 gap-y-2 text-sm text-neutral-700`}>
                {sorted.map((d) => (
                  <Fragment key={d.weekday}>
                    <div>{DAY_LABELS[d.weekday]}</div>
                    <div className="text-right">
                      {d.is_open ? `${formatClockTime(d.open_time)} – ${formatClockTime(d.close_time)}` : "Closed"}
                    </div>
                  </Fragment>
                ))}
              </div>
            </>
          ) : (
            !location.is_bookable && (
              <p className="text-sm leading-relaxed text-neutral-500">
                We&apos;re opening a new studio here soon. Check back for hours, pricing, and booking.
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}
