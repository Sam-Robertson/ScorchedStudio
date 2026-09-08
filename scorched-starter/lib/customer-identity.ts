// lib/customer-identity.ts - server-only
//
// The customers table holds credentials only (email + password_hash), no
// name column. Rather than add one and a migration Sam has to run before the
// nav works, the display name is read from whatever the customer last told
// us on a course enrollment or a booking. Both already collect a name and
// both key on email, the same identity convention the account pages use.
import { getSupabase } from "@/lib/supabase";

// Nothing here may throw: this feeds the header avatar on every page, and a
// transient query failure should cost initials, not the whole nav.
export async function getDisplayNameByEmail(email: string): Promise<string | null> {
  const sb = getSupabase();

  const [enrollment, booking] = await Promise.all([
    sb
      .from("course_enrollments")
      .select("name")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("bookings")
      .select("name")
      .eq("email", email)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]).catch(() => [null, null] as const);

  const name = enrollment?.data?.name || booking?.data?.name || null;
  return name?.trim() || null;
}

// Two letters where we can get them, one where we can't. Falls back to the
// email's local part so a brand-new account with no bookings still gets a
// filled circle instead of an empty one.
export function initialsFor(name: string | null, email: string): string {
  const fromName = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (fromName.length >= 2) {
    return (fromName[0][0] + fromName[fromName.length - 1][0]).toUpperCase();
  }
  if (fromName.length === 1 && fromName[0].length > 0) {
    return fromName[0].slice(0, 2).toUpperCase();
  }

  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._+-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (local.slice(0, 2) || "?").toUpperCase();
}
