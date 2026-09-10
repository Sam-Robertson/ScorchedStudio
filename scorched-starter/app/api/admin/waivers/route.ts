// app/api/admin/waivers/route.ts
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { denverDayRangeUTC } from "@/lib/timezone";

const COLUMNS =
  "id, first_name, last_name, email, phone, date_of_birth, signed_at, ip_address, minors, location";

const SORT_FIELDS = ["first_name", "email", "signed_at", "date_of_birth"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 200;

// A PostgREST `or=` value is a comma-separated list with its own grammar, so a
// search for "smith, john" or "o'brien (jr)" would unbalance the filter. Dots
// survive on purpose: only the first two are parsed as column.operator, so an
// email search still works.
function sanitizeToken(token: string): string {
  return token.replace(/[,()*%\\"]/g, "").trim();
}

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;

  // A location account is pinned to its own location; only an admin may pick.
  const roleLocation = session.role === "location" ? session.location : null;
  const location = roleLocation ?? sp.get("location") ?? null;

  const tokens = (sp.get("search") ?? "")
    .split(/\s+/)
    .map(sanitizeToken)
    .filter(Boolean);

  const dateFrom = sp.get("dateFrom") ?? "";
  const dateTo = sp.get("dateTo") ?? "";

  const requestedSort = sp.get("sort");
  const sortField: SortField = SORT_FIELDS.includes(requestedSort as SortField)
    ? (requestedSort as SortField)
    : "signed_at";
  const ascending = sp.get("dir") === "asc";

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const from = (page - 1) * pageSize;

  const sb = getSupabase();

  let query = sb.from("waivers").select(COLUMNS, { count: "exact" });
  if (location) query = query.eq("location", location);

  // signed_at is a timestamptz, so a bare "YYYY-MM-DD" bound would be read as
  // UTC and put every evening signature in the next day's bucket. Denver day
  // boundaries instead; endUTC is already the start of the following day.
  if (dateFrom) query = query.gte("signed_at", denverDayRangeUTC(dateFrom).startUTC);
  if (dateTo) query = query.lt("signed_at", denverDayRangeUTC(dateTo).endUTC);

  // Successive .or() calls AND together, so every token has to match somewhere.
  // That keeps "john sm" matching "John Smith" across the name boundary, the
  // way the old client-side `${first} ${last}`.includes(q) did.
  for (const token of tokens) {
    query = query.or(`first_name.ilike.*${token}*,last_name.ilike.*${token}*,email.ilike.*${token}*`);
  }

  const { data, error, count } = await query
    .order(sortField, { ascending })
    // Tiebreaker so the sort is total: offset paging over a non-unique order
    // can repeat or drop rows across a page boundary.
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("ADMIN_WAIVERS_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Unfiltered count for the "N of M total" header, still inside whatever the
  // caller's role lets them see.
  let grandQuery = sb.from("waivers").select("id", { count: "exact", head: true });
  if (roleLocation) grandQuery = grandQuery.eq("location", roleLocation);
  const { count: grandTotal, error: grandError } = await grandQuery;
  if (grandError) {
    console.error("ADMIN_WAIVERS_COUNT_ERROR", grandError);
    return Response.json({ error: grandError.message }, { status: 500 });
  }

  return Response.json({ rows: data ?? [], total: count ?? 0, grandTotal: grandTotal ?? 0 });
}
