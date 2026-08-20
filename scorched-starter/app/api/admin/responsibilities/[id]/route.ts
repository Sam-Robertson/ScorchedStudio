// app/api/admin/responsibilities/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const patchSchema = z.object({
  text: z.string().min(1).optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  hours: z.number().positive().nullable().optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("responsibilities")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_RESPONSIBILITIES_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update responsibility." }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await getSupabase().from("responsibilities").delete().eq("id", id);

  if (error) {
    console.error("ADMIN_RESPONSIBILITIES_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete responsibility." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
