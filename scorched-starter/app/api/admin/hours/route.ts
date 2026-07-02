import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { SESSION_LENGTH_MINUTES } from "@/lib/booking-utils";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("business_hours").select("*").order("weekday");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ hours: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await req.json();
    if (!Array.isArray(rows) || rows.length !== 7) {
      return Response.json({ error: "Must provide all 7 weekdays" }, { status: 400 });
    }

    const weekdays = new Set<number>();
    for (const r of rows) {
      if (
        typeof r.weekday !== "number" ||
        r.weekday < 0 ||
        r.weekday > 6 ||
        typeof r.is_open !== "boolean" ||
        typeof r.open_time !== "string" ||
        typeof r.close_time !== "string"
      ) {
        return Response.json({ error: "Each row needs weekday, is_open, open_time, close_time" }, { status: 400 });
      }
      weekdays.add(r.weekday);

      if (r.is_open) {
        const openMin = toMinutes(r.open_time);
        const closeMin = toMinutes(r.close_time);
        if (closeMin - openMin < SESSION_LENGTH_MINUTES) {
          return Response.json(
            { error: `Weekday ${r.weekday}: hours must span at least ${SESSION_LENGTH_MINUTES} minutes to allow one booking` },
            { status: 400 }
          );
        }
      }
    }
    if (weekdays.size !== 7) {
      return Response.json({ error: "Must provide exactly one row per weekday (0-6)" }, { status: 400 });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from("business_hours")
      .upsert(
        rows.map((r) => ({
          weekday: r.weekday,
          is_open: r.is_open,
          open_time: r.open_time,
          close_time: r.close_time,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "weekday" }
      )
      .select()
      .order("weekday");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ hours: data });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
