import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("blocked_dates").select("*").order("date");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ blockedDates: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { date, reason } = await req.json();
    if (typeof date !== "string" || !DATE_RE.test(date)) {
      return Response.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("blocked_dates")
      .insert({ date, reason: typeof reason === "string" ? reason.trim() || null : null })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ blockedDate: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
