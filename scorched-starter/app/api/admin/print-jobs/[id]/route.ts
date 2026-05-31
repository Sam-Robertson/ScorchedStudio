import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const restore = body.restore === true;
    const sb = getSupabase();
    const update = restore
      ? { status: "pending", printed_at: null }
      : { status: "printed", printed_at: new Date().toISOString() };
    const { data, error } = await sb
      .from("print_jobs")
      .update(update)
      .eq("id", id)
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ job: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
