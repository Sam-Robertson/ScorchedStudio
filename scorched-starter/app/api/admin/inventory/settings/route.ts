import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSettings, updateTrackingStartDate } from "@/lib/inventory";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await getSettings();
    return Response.json({ settings });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { tracking_start_date } = await req.json();
    if (!tracking_start_date) return Response.json({ error: "tracking_start_date is required" }, { status: 400 });
    await updateTrackingStartDate(tracking_start_date);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
