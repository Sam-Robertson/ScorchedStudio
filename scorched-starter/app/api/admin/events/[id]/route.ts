// app/api/admin/events/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  group_size: z.number().int().positive().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
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
    .from("events")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_EVENTS_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update event." }, { status: 500 });
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
  const { error } = await getSupabase().from("events").delete().eq("id", id);

  if (error) {
    console.error("ADMIN_EVENTS_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete event." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
