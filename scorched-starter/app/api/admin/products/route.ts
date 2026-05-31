import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("products").select("*").order("name");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ products: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { name, width_in, height_in, notes, active } = await req.json();
    if (!name || !width_in || !height_in) {
      return Response.json({ error: "Name, width, and height are required" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .insert({
        name: name.trim(),
        width_in: parseFloat(width_in),
        height_in: parseFloat(height_in),
        notes: notes?.trim() || null,
        active: active ?? true,
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ product: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
