// app/api/admin/shifts/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start"); // ISO timestamp, inclusive
  const end = searchParams.get("end"); // ISO timestamp, exclusive
  const locationId = searchParams.get("locationId");

  if (!start || !end) {
    return Response.json({ error: "start and end are required" }, { status: 400 });
  }

  let query = getSupabase()
    .from("schedule_shifts")
    .select("*")
    .eq("status", "published")
    .eq("is_deleted", false)
    .gte("start_at", start)
    .lt("start_at", end)
    .order("start_at");

  if (locationId) {
    query = query.eq("square_location_id", locationId);
  }

  const { data: shifts, error } = await query;
  if (error) {
    console.error("ADMIN_SHIFTS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch shifts" }, { status: 500 });
  }

  const teamMemberIds = Array.from(new Set((shifts ?? []).map((s) => s.square_team_member_id)));
  const { data: staff, error: staffError } = await getSupabase()
    .from("staff")
    .select("square_team_member_id, name")
    .in("square_team_member_id", teamMemberIds.length > 0 ? teamMemberIds : [""]);

  if (staffError) {
    console.error("ADMIN_SHIFTS_STAFF_GET_ERROR", staffError);
    return Response.json({ error: "Failed to fetch staff" }, { status: 500 });
  }

  const nameByTeamMemberId = new Map((staff ?? []).map((s) => [s.square_team_member_id, s.name]));

  const result = (shifts ?? []).map((shift) => ({
    ...shift,
    staff_name: nameByTeamMemberId.get(shift.square_team_member_id) ?? null,
  }));

  return Response.json(result);
}
