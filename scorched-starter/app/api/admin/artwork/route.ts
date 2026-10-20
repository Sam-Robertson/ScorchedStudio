import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { parseArtworkInput } from "@/lib/artwork";
import { withContractUrl, withContractUrls } from "@/lib/artwork-files";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await getSupabase()
      .from("artwork_leases")
      .select("*")
      .order("status")
      .order("lease_end", { ascending: true, nullsFirst: false })
      .order("title");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ artwork: await withContractUrls(data ?? []) });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = parseArtworkInput(await req.json());
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await getSupabase().from("artwork_leases").insert(parsed.row).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ artwork: await withContractUrl(data) });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
