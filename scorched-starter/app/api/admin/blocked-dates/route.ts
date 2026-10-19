import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

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
    const { date, reason, open_time, close_time } = await req.json();
    if (typeof date !== "string" || !DATE_RE.test(date)) {
      return Response.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }
    // No hours closes the date. Both hours open it with those hours instead
    // of the weekday's usual ones.
    const hasOpen = typeof open_time === "string" && open_time !== "";
    const hasClose = typeof close_time === "string" && close_time !== "";
    if (hasOpen !== hasClose) {
      return Response.json({ error: "Give both an open and a close time, or neither" }, { status: 400 });
    }
    if (hasOpen) {
      if (!TIME_RE.test(open_time) || !TIME_RE.test(close_time)) {
        return Response.json({ error: "Times must be in HH:MM format" }, { status: 400 });
      }
      if (toMinutes(open_time) >= toMinutes(close_time)) {
        return Response.json({ error: "Close time must be after open time" }, { status: 400 });
      }
    }
    const sb = getSupabase();
    // Upsert, so adding a date again replaces its hours instead of failing.
    const { data, error } = await sb
      .from("blocked_dates")
      .upsert(
        {
          date,
          reason: typeof reason === "string" ? reason.trim() || null : null,
          open_time: hasOpen ? open_time : null,
          close_time: hasOpen ? close_time : null,
        },
        { onConflict: "date" }
      )
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ blockedDate: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
