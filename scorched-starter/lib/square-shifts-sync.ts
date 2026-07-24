// lib/square-shifts-sync.ts — server-only
//
// Backfill/on-demand sync of Square Labor API ScheduledShifts and Team
// Members into Supabase. Also used by the webhook handler to upsert a
// single shift.

import { getSupabase } from "@/lib/supabase";
import {
  listJobs,
  retrieveScheduledShift,
  searchScheduledShifts,
  searchTeamMembers,
  type SquareScheduledShift,
} from "@/lib/square";

const DEFAULT_TIMEZONE = process.env.SQUARE_DEFAULT_TIMEZONE || "America/Denver";

function shiftToRow(shift: SquareScheduledShift, jobTitleById: Map<string, string>) {
  const details = shift.published_shift_details ?? shift.draft_shift_details;
  if (!shift.id || !details?.start_at || !details.location_id || !details.team_member_id) {
    return null;
  }

  return {
    square_shift_id: shift.id,
    square_location_id: details.location_id,
    square_team_member_id: details.team_member_id,
    job_title: details.job_id ? jobTitleById.get(details.job_id) ?? null : null,
    start_at: details.start_at,
    end_at: details.end_at ?? null,
    notes: details.notes ?? null,
    status: shift.published_shift_details ? "published" : "draft",
    is_deleted: details.is_deleted ?? false,
    raw_payload: shift,
    synced_at: new Date().toISOString(),
  };
}

async function loadJobTitles(): Promise<Map<string, string>> {
  const jobTitleById = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const { jobs, cursor: next } = await listJobs(cursor);
    for (const job of jobs) {
      if (job.id && job.title) jobTitleById.set(job.id, job.title);
    }
    cursor = next;
  } while (cursor);

  return jobTitleById;
}

export async function syncTeamMembers(): Promise<number> {
  const supabase = getSupabase();
  let cursor: string | undefined;
  let count = 0;

  do {
    const { teamMembers, cursor: next } = await searchTeamMembers(cursor);
    const rows = teamMembers
      .filter((member) => member.id)
      .map((member) => ({
        square_team_member_id: member.id!,
        name: [member.given_name, member.family_name].filter(Boolean).join(" ") || "Unknown",
        updated_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from("staff")
        .upsert(rows, { onConflict: "square_team_member_id" });
      if (error) throw new Error(`SQUARE_SYNC_STAFF_UPSERT_ERROR: ${error.message}`);
      count += rows.length;
    }

    cursor = next;
  } while (cursor);

  return count;
}

export async function backfillScheduledShifts(params: {
  locationIds: string[];
  startDate: string;
  endDate: string;
}): Promise<number> {
  const supabase = getSupabase();
  const jobTitleById = await loadJobTitles();

  let cursor: string | undefined;
  let count = 0;

  do {
    const { scheduledShifts, cursor: next } = await searchScheduledShifts({
      locationIds: params.locationIds,
      startDate: params.startDate,
      endDate: params.endDate,
      defaultTimezone: DEFAULT_TIMEZONE,
      cursor,
    });

    const rows = scheduledShifts
      .map((shift) => shiftToRow(shift, jobTitleById))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      const { error } = await supabase
        .from("schedule_shifts")
        .upsert(rows, { onConflict: "square_shift_id" });
      if (error) throw new Error(`SQUARE_SYNC_SHIFTS_UPSERT_ERROR: ${error.message}`);
      count += rows.length;
    }

    cursor = next;
  } while (cursor);

  return count;
}

export async function upsertScheduledShift(shift: SquareScheduledShift): Promise<void> {
  const jobTitleById = await loadJobTitles();
  const row = shiftToRow(shift, jobTitleById);
  if (!row) return;

  const { error } = await getSupabase()
    .from("schedule_shifts")
    .upsert(row, { onConflict: "square_shift_id" });
  if (error) throw new Error(`SQUARE_WEBHOOK_SHIFT_UPSERT_ERROR: ${error.message}`);
}

export async function upsertScheduledShiftById(shiftId: string): Promise<void> {
  const shift = await retrieveScheduledShift(shiftId);
  if (!shift) return;
  await upsertScheduledShift(shift);
}

export async function markScheduledShiftDeleted(shiftId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("schedule_shifts")
    .update({ is_deleted: true, synced_at: new Date().toISOString() })
    .eq("square_shift_id", shiftId);
  if (error) throw new Error(`SQUARE_WEBHOOK_SHIFT_DELETE_ERROR: ${error.message}`);
}
