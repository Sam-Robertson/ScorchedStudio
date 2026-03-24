// app/api/admin/waivers/route.ts
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabase()
    .from("waivers")
    .select("id, first_name, last_name, email, phone, date_of_birth, signature_data, signed_at, ip_address")
    .order("signed_at", { ascending: false });

  if (error) {
    console.error("ADMIN_WAIVERS_ERROR", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
