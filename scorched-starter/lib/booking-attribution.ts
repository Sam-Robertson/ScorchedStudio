// lib/booking-attribution.ts
// Server side of lib/attribution.ts: writes the campaign columns onto a
// booking row after it exists. Kept as a separate update, not part of the
// insert, so a database that has not had supabase-booking-attribution-setup.sql
// run yet still takes bookings; a failure here is logged, never surfaced.

import { getSupabase } from "@/lib/supabase";
import { toBookingColumns, type Attribution } from "@/lib/attribution";

export async function saveBookingAttribution(bookingId: string, attribution: Attribution | null | undefined): Promise<void> {
  const cols = toBookingColumns(attribution);
  if (!cols) return;
  try {
    const { error } = await getSupabase().from("bookings").update(cols).eq("id", bookingId);
    if (error) console.error("BOOKING_ATTRIBUTION_SAVE_FAILED", { bookingId, error: error.message });
  } catch (e) {
    console.error("BOOKING_ATTRIBUTION_SAVE_FAILED", { bookingId, error: e instanceof Error ? e.message : String(e) });
  }
}
