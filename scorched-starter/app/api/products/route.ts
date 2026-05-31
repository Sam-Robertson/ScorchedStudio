import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .select("id, name, width_in, height_in, notes")
      .eq("active", true)
      .order("name");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ products: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
