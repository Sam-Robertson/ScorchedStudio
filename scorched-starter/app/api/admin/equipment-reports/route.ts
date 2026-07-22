// app/api/admin/equipment-reports/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabase()
    .from("equipment_reports")
    .select("*")
    .order("created_at", { ascending: false });

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
  if (!isAuthed(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: report, error } = await getSupabase()
    .from("equipment_reports")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_EQUIPMENT_REPORTS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create report." }, { status: 500 });
  }

  return Response.json(report, { status: 201 });
}
