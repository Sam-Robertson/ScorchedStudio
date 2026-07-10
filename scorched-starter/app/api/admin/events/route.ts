// app/api/admin/events/route.ts
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

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM

  let query = getSupabase().from("events").select("*").order("date").order("start_time");

  if (month) {
    query = query.gte("date", `${month}-01`).lte("date", `${month}-31`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("ADMIN_EVENTS_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch events" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  group_size: z.number().int().positive().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
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

  const { data, error } = await getSupabase()
    .from("events")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_EVENTS_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create event." }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
