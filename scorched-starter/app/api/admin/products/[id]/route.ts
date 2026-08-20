import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined)      patch.name      = body.name.trim();
    if (body.width_in !== undefined)  patch.width_in  = parseFloat(body.width_in);
    if (body.height_in !== undefined) patch.height_in = parseFloat(body.height_in);
    if (body.notes !== undefined)     patch.notes     = body.notes?.trim() || null;
    if (body.active !== undefined)    patch.active    = body.active;

    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ product: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
