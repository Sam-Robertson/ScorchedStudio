// lib/booking-utils.ts — server-only (imports getSupabase); do not import from "use client" files
import { getSupabase } from "@/lib/supabase";

export type LocationKey = "orem" | "slc";

export const MAX_CAPACITY = 20;
export const MAX_PARTY_SIZE = 15;
export const PRICE_PER_PERSON = 15;
export const PRICE_PER_PERSON_CENTS = 1500;

// Fixed, not admin-configurable.
export const SESSION_LENGTH_MINUTES = 90;
export const SLOT_INTERVAL_MINUTES = 30;

type DayHours = {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

// Used only if Supabase is unreachable or business_hours is empty. Mirrors the
// schedule that used to be hardcoded. Fail OPEN (bookable), never fail closed.
const FALLBACK_HOURS: DayHours[] = [
  { weekday: 0, is_open: false, open_time: "17:00", close_time: "22:00" },
  { weekday: 1, is_open: true, open_time: "17:00", close_time: "22:00" },
  { weekday: 2, is_open: true, open_time: "17:00", close_time: "22:00" },
  { weekday: 3, is_open: true, open_time: "17:00", close_time: "22:00" },
  { weekday: 4, is_open: true, open_time: "17:00", close_time: "22:00" },
  { weekday: 5, is_open: true, open_time: "17:00", close_time: "22:00" },
  { weekday: 6, is_open: true, open_time: "11:00", close_time: "22:00" },
];

const HOURS_CACHE_TTL_MS = 60_000;

// null means "this location genuinely has no hours configured yet" (closed
// every day) — distinct from a real fetch error, which still fails open to
// FALLBACK_HOURS. Conflating the two would silently apply Orem's schedule to
// a brand-new location (e.g. SLC before its hours are set), which is wrong
// in the other direction: better to show no availability than someone
// else's hours.
const hoursCache = new Map<LocationKey, { data: DayHours[] | null; expiresAt: number }>();

async function getBusinessHours(location: LocationKey): Promise<DayHours[] | null> {
  const cached = hoursCache.get(location);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const { data, error } = await getSupabase()
      .from("business_hours")
      .select("weekday, is_open, open_time, close_time")
      .eq("location", location);
    if (error) throw error;
    const result = !data || data.length === 0 ? null : (data as DayHours[]);
    hoursCache.set(location, { data: result, expiresAt: Date.now() + HOURS_CACHE_TTL_MS });
    return result;
  } catch (e) {
    console.error("Failed to load business_hours, using fallback schedule:", e);
    return FALLBACK_HOURS;
  }
}

let blockedCache: { data: Set<string>; expiresAt: number } | null = null;

async function getBlockedDates(): Promise<Set<string>> {
  if (blockedCache && blockedCache.expiresAt > Date.now()) return blockedCache.data;
  try {
    const { data, error } = await getSupabase().from("blocked_dates").select("date");
    if (error) throw error;
    const set = new Set((data ?? []).map((row) => row.date as string));
    blockedCache = { data: set, expiresAt: Date.now() + HOURS_CACHE_TTL_MS };
    return set;
  } catch (e) {
    console.error("Failed to load blocked_dates, treating as none blocked:", e);
    return new Set();
  }
}

// "17:00" -> "5:00 PM"
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function generateSlots(openTime: string, closeTime: string, intervalMin: number): string[] {
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const lastStartMin = closeMin - SESSION_LENGTH_MINUTES;
  const slots: string[] = [];
  for (let t = openMin; t <= lastStartMin; t += intervalMin) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    slots.push(formatTime(`${hh}:${mm}`));
  }
  return slots;
}

// `location` defaults to "orem" so callers that haven't been updated yet
// keep today's single-location behavior exactly.
export async function getSlotsForDate(dateStr: string, location: LocationKey = "orem"): Promise<string[]> {
  const blocked = await getBlockedDates();
  if (blocked.has(dateStr)) return [];

  // Use noon local time to avoid timezone edge cases
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.getDay(); // 0=Sun..6=Sat

  const hours = await getBusinessHours(location);
  if (hours === null) return []; // no hours configured for this location yet — closed

  const dayHours = hours.find((h) => h.weekday === weekday) ?? FALLBACK_HOURS[weekday];
  if (!dayHours.is_open) return [];

  return generateSlots(dayHours.open_time, dayHours.close_time, SLOT_INTERVAL_MINUTES);
}
