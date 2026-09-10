// app/api/admin/waivers/route.ts
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationFilter =
    session.role === "location" ? session.location : new URL(req.url).searchParams.get("location");

  // PostgREST caps an unbounded select at 1000 rows and says nothing about
  // it, so the admin table quietly stopped at "1000 of 1000 total" once the
  // table passed that mark, hiding every waiver older than the newest 1000.
  // Paged through explicitly instead. The page filters and paginates client
  // side, so it does want the whole set; if this list keeps growing that
  // should move server side rather than this cap going up.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 50; // 50k waivers, well past where server-side paging is overdue
  const rows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = getSupabase()
      .from("waivers")
      .select("id, first_name, last_name, email, phone, date_of_birth, signed_at, ip_address, minors, location")
      .order("signed_at", { ascending: false })
      // Tiebreaker so the sort is total: offset paging over a non-unique
      // order can repeat or drop rows across page boundaries.
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (locationFilter) query = query.eq("location", locationFilter);

    const { data, error } = await query;
    if (error) {
      console.error("ADMIN_WAIVERS_ERROR", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return Response.json(rows);
}
