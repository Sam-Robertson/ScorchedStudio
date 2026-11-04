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

// Photos keyed by location key. Drop a path in here and the section renders it.
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

// Collapse consecutive days with identical hours into one row, so a studio
// open 5 to 10 on weekdays reads "Monday – Friday" instead of five lines.
// Days run Monday through Sunday so the weekend groups together.
function groupHours(hours: PublicDayHours[]): { days: string; hours: string }[] {
  const ordered = [...hours].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const label = (d: PublicDayHours) =>
    d.is_open ? `${formatClockTime(d.open_time)} – ${formatClockTime(d.close_time)}` : "Closed";
  const groups: { first: number; last: number; hours: string }[] = [];
  for (const d of ordered) {
    const text = label(d);
    const prev = groups[groups.length - 1];
    if (prev && prev.hours === text) prev.last = d.weekday;
    else groups.push({ first: d.weekday, last: d.weekday, hours: text });
  }
  return groups.map((g) => ({
    days: g.first === g.last ? DAY_LABELS[g.first] : `${DAY_LABELS[g.first]} – ${DAY_LABELS[g.last]}`,
    hours: g.hours,
  }));
}

function LocationSection({ location, hours }: { location: LocationRecord; hours: PublicDayHours[] }) {
  const rows = groupHours(hours);
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
          {location.email && (
            <a
              href={`mailto:${location.email}`}
              className={`${vulfMono.className} block text-sm text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline`}
            >
              {location.email}
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
          {rows.length > 0 ? (
            <>
              <p className={`${vulfMono.className} text-[10px] tracking-[0.15em] uppercase text-neutral-400 mb-3`}>
                Hours
              </p>
              <div className={`${vulfMono.className} grid grid-cols-2 gap-y-2 text-sm text-neutral-700`}>
                {rows.map((r) => (
                  <Fragment key={r.days}>
                    <div>{r.days}</div>
                    <div className="text-right">{r.hours}</div>
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
