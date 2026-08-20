import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = requireInStudio(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const restore = body.restore === true;
    const sb = getSupabase();
    const update = restore
      ? { status: "pending", printed_at: null }
      : { status: "printed", printed_at: new Date().toISOString() };

    let query = sb.from("print_jobs").update(update).eq("id", id);
    if (session.role === "location") query = query.eq("location", session.location);

    const { data, error } = await query.select("id").maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Print job not found" }, { status: 404 });
    return Response.json({ job: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
