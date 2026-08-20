// app/api/admin/shifts/sync/route.ts
//
// Protected admin route to trigger a Square scheduled-shift backfill on
// demand: initial load, or gap recovery if a webhook was ever missed.
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { backfillScheduledShifts, syncTeamMembers } from "@/lib/square-shifts-sync";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function defaultLocationIds(): string[] {
  return (process.env.SQUARE_LOCATION_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

const syncSchema = z.object({
  locationIds: z.array(z.string()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = syncSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const locationIds = parsed.data.locationIds?.length ? parsed.data.locationIds : defaultLocationIds();
  if (locationIds.length === 0) {
    return Response.json({ error: "No Square location IDs configured" }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = addDays(today, -today.getDay());

  const startDate = parsed.data.startDate ?? toDateStr(startOfWeek);
  const endDate = parsed.data.endDate ?? toDateStr(addDays(startOfWeek, 27));

  try {
    const staffSynced = await syncTeamMembers();
    const shiftsSynced = await backfillScheduledShifts({ locationIds, startDate, endDate });
    return Response.json({ staffSynced, shiftsSynced, startDate, endDate, locationIds });
  } catch (err) {
    console.error("SQUARE_SHIFTS_SYNC_ERROR", err);
    return Response.json({ error: "Failed to sync Square shifts" }, { status: 500 });
  }
}
