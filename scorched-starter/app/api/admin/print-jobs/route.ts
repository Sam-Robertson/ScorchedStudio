import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();

    // Auto-cleanup: delete all print jobs older than 24 hours regardless of status
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await sb.from("print_jobs").delete().lt("created_at", cutoff);

    let query = sb
      .from("print_jobs")
      .select("*, products(name, width_in, height_in)")
      .in("status", ["pending", "printed"])
      .order("created_at", { ascending: true });

    if (session.role === "location") {
      query = query.eq("location", session.location);
    } else {
      const locationFilter = new URL(req.url).searchParams.get("location");
      if (locationFilter) query = query.eq("location", locationFilter);
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const pending = (data ?? []).filter((j) => j.status === "pending");
    const printed = (data ?? []).filter((j) => j.status === "printed");
    return Response.json({ jobs: pending, recentlyPrinted: printed });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
