// app/api/admin/responsibilities/route.ts
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
    .from("responsibilities")
    .select("*")
    .order("cadence")
    .order("position")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ADMIN_RESPONSIBILITIES_GET_ERROR", error);
    return Response.json({ error: "Failed to fetch responsibilities" }, { status: 500 });
  }

  return Response.json(data);
}

const createSchema = z.object({
  text: z.string().min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  hours: z.number().positive().nullable().optional(),
  position: z.number().int().default(0),
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
    .from("responsibilities")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("ADMIN_RESPONSIBILITIES_CREATE_ERROR", error);
    return Response.json({ error: "Failed to create responsibility." }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
