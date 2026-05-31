import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { product_id, image_base64 } = await req.json();
    if (!product_id || !image_base64) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("print_jobs")
      .insert({ product_id, image_base64, status: "pending" })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ job: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
