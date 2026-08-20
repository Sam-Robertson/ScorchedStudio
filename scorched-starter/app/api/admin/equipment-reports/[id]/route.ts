// app/api/admin/equipment-reports/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

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
  const session = requireInStudio(req);
  if (!session) {
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

  let query = getSupabase().from("equipment_reports").update(updates).eq("id", id);
  if (session.role === "location") query = query.eq("location", session.location);

  const { data: report, error } = await query.select().maybeSingle();

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_PATCH_ERROR", error);
    return Response.json({ error: "Failed to update report." }, { status: 500 });
  }
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  return Response.json(report);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let query = getSupabase().from("equipment_reports").delete().eq("id", id);
  if (session.role === "location") query = query.eq("location", session.location);

  const { data, error } = await query.select().maybeSingle();

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_DELETE_ERROR", error);
    return Response.json({ error: "Failed to delete report." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
