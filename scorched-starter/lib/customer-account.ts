// lib/customer-account.ts — server-only
//
// Booking lookups for the customer-facing /account dashboard. No dedicated
// lib/bookings.ts exists in this codebase (booking queries are normally
// inlined per-route) — this is the one exception, since the account page
// needs it alongside the membership/course lookups that already live in
// their own lib files.
import { getSupabase } from "@/lib/supabase";
import type { BookingRecord } from "@/lib/supabase";

export async function getBookingsByEmail(email: string): Promise<BookingRecord[]> {
  const { data, error } = await getSupabase()
    .from("bookings")
    .select("*")
    .eq("email", email)
    .order("date", { ascending: false });
  if (error) throw error;
  return data as BookingRecord[];
}
