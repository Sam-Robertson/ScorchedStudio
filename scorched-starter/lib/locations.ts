// lib/locations.ts — server-only data layer for the locations table
import { getSupabase } from "@/lib/supabase";
import { hashPassword, verifyPassword, type LocationKey } from "@/lib/admin-session";
import { todayInDenverYmd } from "@/lib/timezone";

export type LocationRecord = {
  key: LocationKey;
  name: string;
  password_hash: string | null;
  password_salt: string | null;
  is_bookable: boolean;
  capacity: number;
  max_party_size: number;
  address: string | null;
  phone: string | null;
  // The studio's own inbox. Contact messages and job applications for this
  // location land here; CONTACT_TO is the fallback when it is unset.
  email: string | null;
  opening_estimate: string | null;
  created_at: string;
  updated_at: string;
};

// The key/name pair a public form needs to offer a studio choice.
export type LocationOption = { key: LocationKey; name: string };

// Both studios, open or not: someone asking about the Salt Lake studio before
// it opens still needs to reach the right inbox. Falls back to the known pair
// so a Supabase hiccup never takes a contact form down.
export async function getLocationOptions(): Promise<LocationOption[]> {
  try {
    const locations = await getLocations();
    if (locations.length > 0) return locations.map((l) => ({ key: l.key, name: l.name }));
  } catch (e) {
    console.error("LOCATION_OPTIONS_ERROR", e);
  }
  return [
    { key: "orem", name: "Orem" },
    { key: "slc", name: "Salt Lake City" },
  ];
}

// Where mail about a studio should land: its own inbox when one is set,
// otherwise the shared CONTACT_TO address. Also returns the location so the
// caller can name the studio in the message.
export async function getLocationContactEmail(
  key: string | null | undefined
): Promise<{ to: string | undefined; location: LocationRecord | null }> {
  let location: LocationRecord | null = null;
  if (key) {
    try {
      location = await getLocationByKey(key);
    } catch (e) {
      console.error("LOCATION_EMAIL_LOOKUP_ERROR", e);
    }
  }
  return { to: location?.email || process.env.CONTACT_TO || undefined, location };
}

// Job openings store their location as display text ("Orem"), so an opening
// is matched to a studio by name or key, case-insensitively. Null when the
// text is blank or names no studio.
export async function findLocationByNameOrKey(text: string | null | undefined): Promise<LocationRecord | null> {
  const needle = (text ?? "").trim().toLowerCase();
  if (!needle) return null;
  try {
    const locations = await getLocations();
    return (
      locations.find((l) => l.key.toLowerCase() === needle || l.name.trim().toLowerCase() === needle) ?? null
    );
  } catch (e) {
    console.error("LOCATION_MATCH_ERROR", e);
    return null;
  }
}

export type PublicDayHours = {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "18:00:00" -> "6:00 PM"
export function formatClockTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export type SpecialDateRecord = {
  date: string;
  reason: string | null;
  open_time: string | null;
  close_time: string | null;
};

// Holidays and special dates coming up soon, for the public hours displays.
// Fails soft to none: a missing column or a fetch error should never take the
// homepage down with it.
export async function getUpcomingSpecialDates(days = 60): Promise<SpecialDateRecord[]> {
  const today = todayInDenverYmd();
  const end = new Date(today + "T12:00:00");
  end.setDate(end.getDate() + days);
  const endYmd = end.toISOString().slice(0, 10);
  try {
    const { data, error } = await getSupabase()
      .from("blocked_dates")
      .select("date, reason, open_time, close_time")
      .gte("date", today)
      .lte("date", endYmd)
      .order("date");
    if (error) throw error;
    return (data ?? []) as SpecialDateRecord[];
  } catch (e) {
    console.error("Failed to load upcoming special dates:", e);
    return [];
  }
}

// Read-only, for the public /locations page. Unlike booking-utils' hours
// lookup, this never fails open with a fallback schedule — if a location
// has no hours configured, the page should show nothing, not someone
// else's hours.
export async function getPublicBusinessHours(key: string): Promise<PublicDayHours[]> {
  const { data, error } = await getSupabase()
    .from("business_hours")
    .select("weekday, is_open, open_time, close_time")
    .eq("location", key)
    .order("weekday");
  if (error) throw error;
  return (data ?? []) as PublicDayHours[];
}

export async function getLocations(): Promise<LocationRecord[]> {
  const { data, error } = await getSupabase().from("locations").select("*").order("key");
  if (error) throw error;
  return data as LocationRecord[];
}

export async function getLocationByKey(key: string): Promise<LocationRecord | null> {
  const { data, error } = await getSupabase().from("locations").select("*").eq("key", key).maybeSingle();
  if (error) throw error;
  return data as LocationRecord | null;
}

export async function getBookableLocations(): Promise<LocationRecord[]> {
  const { data, error } = await getSupabase().from("locations").select("*").eq("is_bookable", true).order("key");
  if (error) throw error;
  return data as LocationRecord[];
}

// Returns the location key whose password matches, or null. Skips any
// location that has no password set yet.
export async function matchLocationPassword(password: string): Promise<LocationKey | null> {
  const locations = await getLocations();
  for (const loc of locations) {
    if (!loc.password_hash || !loc.password_salt) continue;
    if (verifyPassword(password, loc.password_hash, loc.password_salt)) {
      return loc.key;
    }
  }
  return null;
}

export async function setLocationPassword(key: string, password: string): Promise<void> {
  const { hash, salt } = hashPassword(password);
  const { error } = await getSupabase()
    .from("locations")
    .update({ password_hash: hash, password_salt: salt, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) throw error;
}

export async function updateLocation(
  key: string,
  patch: Partial<
    Pick<LocationRecord, "is_bookable" | "capacity" | "max_party_size" | "name" | "address" | "phone" | "email" | "opening_estimate">
  >
): Promise<LocationRecord> {
  const { data, error } = await getSupabase()
    .from("locations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select()
    .single();
  if (error) throw error;
  return data as LocationRecord;
}
