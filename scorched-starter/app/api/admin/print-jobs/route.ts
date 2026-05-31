import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();

    // Auto-cleanup: delete printed jobs older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await sb.from("print_jobs").delete().eq("status", "printed").lt("printed_at", cutoff);

    const { data, error } = await sb
      .from("print_jobs")
      .select("*, products(name, width_in, height_in)")
      .in("status", ["pending", "printed"])
      .order("created_at", { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const pending = (data ?? []).filter((j) => j.status === "pending");
    const printed = (data ?? []).filter((j) => j.status === "printed");
    return Response.json({ jobs: pending, recentlyPrinted: printed });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
