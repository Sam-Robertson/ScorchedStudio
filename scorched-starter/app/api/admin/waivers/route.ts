// app/api/admin/waivers/route.ts
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = getSupabase()
    .from("waivers")
    .select("id, first_name, last_name, email, phone, date_of_birth, signed_at, ip_address, minors, location")
    .order("signed_at", { ascending: false });

  if (session.role === "location") {
    query = query.eq("location", session.location);
  } else {
    const locationFilter = new URL(req.url).searchParams.get("location");
    if (locationFilter) query = query.eq("location", locationFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ADMIN_WAIVERS_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
