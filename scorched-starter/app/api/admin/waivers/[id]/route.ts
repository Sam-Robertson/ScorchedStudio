// app/api/admin/waivers/[id]/route.ts
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireInStudio(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let query = getSupabase().from("waivers").select("signature_data, location").eq("id", id);
  if (session.role === "location") query = query.eq("location", session.location);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("WAIVER_GET_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Waiver not found" }, { status: 404 });
  }

  return Response.json(data);
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

  let query = getSupabase().from("waivers").delete().eq("id", id);
  if (session.role === "location") query = query.eq("location", session.location);

  const { data, error } = await query.select().maybeSingle();

  if (error) {
    console.error("WAIVER_DELETE_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Waiver not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
