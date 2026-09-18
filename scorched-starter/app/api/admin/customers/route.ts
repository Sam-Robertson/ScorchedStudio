// app/api/admin/customers/route.ts
//
// Everyone who has created a login. That is a much smaller set than "everyone
// who has ever visited": bookings and waivers are keyed by email and do not
// require an account, so most customers have no row here at all.
//
// The customers table holds only an email and a password hash, so everything
// else on this page is stitched together by email from the tables that do carry
// it. That is the same join the /account dashboard does for a single person.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { BookingRecord } from "@/lib/supabase";

export type AdminCustomer = {
  id: string;
  email: string;
  createdAt: string;
  // The customers table has no name column. Taken from their most recent
  // booking, falling back to a signed waiver.
  name: string | null;
  bookingCount: number;
  cancelledCount: number;
  totalPaidCents: number;
  lastBookingDate: string | null;
  membershipStatus: string | null;
  enrollmentCount: number;
  hasWaiver: boolean;
};

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sb = getSupabase();

    const { data: customerRows, error } = await sb
      .from("customers")
      .select("id,email,created_at")
      .order("created_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const customers = (customerRows ?? []) as { id: string; email: string; created_at: string }[];
    if (customers.length === 0) return Response.json({ customers: [], accountsOnly: true });

    // Scoped to the account holders rather than pulling whole tables: bookings
    // and waivers run to thousands of rows, and only a handful of people have
    // accounts.
    const emails = customers.map((c) => c.email);

    const [bookingsRes, membershipsRes, enrollmentsRes, waiversRes] = await Promise.all([
      sb.from("bookings").select("email,name,date,amount_paid,status").in("email", emails),
      sb.from("memberships").select("email,status").in("email", emails),
      sb.from("course_enrollments").select("email").in("email", emails),
      sb.from("waivers").select("email,first_name,last_name").in("email", emails),
    ]);

    const bookings = (bookingsRes.data ?? []) as Pick<
      BookingRecord,
      "email" | "name" | "date" | "amount_paid" | "status"
    >[];
    const memberships = (membershipsRes.data ?? []) as { email: string; status: string }[];
    const enrollments = (enrollmentsRes.data ?? []) as { email: string }[];
    const waivers = (waiversRes.data ?? []) as {
      email: string;
      first_name: string | null;
      last_name: string | null;
    }[];

    const byEmail = <T extends { email: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) {
        const key = r.email?.toLowerCase();
        if (!key) continue;
        map.set(key, [...(map.get(key) ?? []), r]);
      }
      return map;
    };

    const bookingsBy = byEmail(bookings);
    const membershipsBy = byEmail(memberships);
    const enrollmentsBy = byEmail(enrollments);
    const waiversBy = byEmail(waivers);

    const result: AdminCustomer[] = customers.map((c) => {
      const key = c.email.toLowerCase();
      const theirs = bookingsBy.get(key) ?? [];
      const live = theirs.filter((b) => b.status !== "cancelled");
      // Cancelled bookings are excluded from the date as well as the count. A
      // booking someone cancelled is not a visit, and showing "0 bookings" next
      // to a date read as a contradiction.
      const sorted = [...live].sort((a, b) => (a.date < b.date ? 1 : -1));
      // The name can still come from a cancelled booking; it is the same person.
      const anySorted = [...theirs].sort((a, b) => (a.date < b.date ? 1 : -1));
      const waiver = (waiversBy.get(key) ?? [])[0];
      const mships = membershipsBy.get(key) ?? [];

      return {
        id: c.id,
        email: c.email,
        createdAt: c.created_at,
        name:
          anySorted[0]?.name ??
          (waiver ? [waiver.first_name, waiver.last_name].filter(Boolean).join(" ") || null : null),
        bookingCount: live.length,
        cancelledCount: theirs.length - live.length,
        // Cancelled bookings are refunded, so they do not count toward spend.
        totalPaidCents: live.reduce((sum, b) => sum + (b.amount_paid ?? 0), 0),
        lastBookingDate: sorted[0]?.date ?? null,
        membershipStatus:
          mships.find((m) => m.status === "active")?.status ?? mships[0]?.status ?? null,
        enrollmentCount: (enrollmentsBy.get(key) ?? []).length,
        hasWaiver: (waiversBy.get(key) ?? []).length > 0,
      };
    });

    return Response.json({ customers: result });
  } catch (err) {
    console.error("ADMIN_CUSTOMERS_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
