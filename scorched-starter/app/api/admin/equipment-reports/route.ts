// app/api/admin/equipment-reports/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { notifyNewEquipmentReport } from "@/lib/equipment-report-notify";

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = getSupabase().from("equipment_reports").select("*").order("created_at", { ascending: false });

  if (session.role === "location") {
    query = query.eq("location", session.location);
  } else {
    const locationFilter = new URL(req.url).searchParams.get("location");
    if (locationFilter) query = query.eq("location", locationFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch reports" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  category: z.enum(["Low Inventory", "Broken", "Other"]),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  notes: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  // A staff-authenticated route, so location is stamped from the session —
  // no manual picker needed. Admin submissions (rare) default to Orem.
  const location = session.role === "location" ? session.location! : "orem";

  const { data: report, error } = await getSupabase()
    .from("equipment_reports")
    .insert({ ...parsed.data, location })
    .select()
    .single();

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create report." }, { status: 500 });
  }

  try {
    await notifyNewEquipmentReport({ ...parsed.data, priority: parsed.data.priority ?? null, location });
  } catch (err) {
    console.error("ADMIN_EQUIPMENT_REPORTS_NOTIFY_ERROR", err);
  }

  return Response.json(report, { status: 201 });
}
