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
  created_at: string;
  updated_at: string;
};

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
  patch: Partial<Pick<LocationRecord, "is_bookable" | "capacity" | "max_party_size" | "name" | "address">>
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
