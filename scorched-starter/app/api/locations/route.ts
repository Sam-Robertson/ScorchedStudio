// app/api/locations/route.ts — public, unauthenticated
// Used by the public /book page to decide whether to show a location picker.
import { getBookableLocations } from "@/lib/locations";

export async function GET() {
  try {
    const locations = await getBookableLocations();
    return Response.json(locations.map((l) => ({ key: l.key, name: l.name })));
  } catch (err) {
    console.error("PUBLIC_LOCATIONS_ERROR", err);
    // Fail open to Orem — matches getSlotsForDate's fail-open philosophy so a
    // Supabase hiccup doesn't take the booking page down entirely.
    return Response.json([{ key: "orem", name: "Orem" }]);
  }
}
