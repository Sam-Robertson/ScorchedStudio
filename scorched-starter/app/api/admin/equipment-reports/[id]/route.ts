// app/api/admin/equipment-reports/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

const patchSchema = z.object({
  category: z.enum(["Low Inventory", "Broken", "Other"]).optional(),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  notes: z.string().min(1).optional(),
  status: z.enum(["Open", "Resolved"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.status === "Resolved") updates.resolved_at = new Date().toISOString();
  if (parsed.data.status === "Open") updates.resolved_at = null;

  const { data: report, error } = await getSupabase()
    .from("equipment_reports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update report." }, { status: 500 });
  }

  return Response.json(report);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await getSupabase().from("equipment_reports").delete().eq("id", id);

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete report." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
