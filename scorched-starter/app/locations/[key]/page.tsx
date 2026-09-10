// app/locations/[key]/page.tsx
// Each location is now a section on /locations. Redirect the old per-location
// routes to the matching anchor so external links keep working, but keep
// 404ing an unknown key rather than sending it to a dead anchor.
import { notFound, redirect } from "next/navigation";
import { getLocationByKey } from "@/lib/locations";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const location = await getLocationByKey(key);
  if (!location) notFound();
  redirect(`/locations#${location.key}`);
}
