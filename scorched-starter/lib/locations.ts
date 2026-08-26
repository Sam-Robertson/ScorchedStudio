// lib/locations.ts — server-only data layer for the locations table
import { getSupabase } from "@/lib/supabase";
import { hashPassword, verifyPassword, type LocationKey } from "@/lib/admin-session";

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
  opening_estimate: string | null;
  created_at: string;
  updated_at: string;
};

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
  patch: Partial<Pick<LocationRecord, "is_bookable" | "capacity" | "max_party_size" | "name" | "address" | "phone" | "opening_estimate">>
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
