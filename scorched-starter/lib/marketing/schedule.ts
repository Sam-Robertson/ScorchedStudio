// lib/marketing/schedule.ts
//
// The rules and formatting around scheduling a campaign. Pure, so the admin
// UI and the update route share one idea of what a valid schedule is.
//
// Times are stored as ISO strings in UTC. The admin picks them in the
// browser's own zone, and they are always displayed in the studio's zone so
// "9:00 AM" means the same thing on every screen.
import type { CampaignStatus } from "@/lib/supabase";

export const STUDIO_TIME_ZONE = "America/Denver";

// Far enough out that a run of the 5 minute cron cannot already be underway
// when the schedule is saved, which would otherwise start it "late" by a
// confusing few minutes.
export const MIN_LEAD_MS = 5 * 60 * 1000;

export type ScheduleCheck = { ok: true; at: Date } | { ok: false; error: string };

// Whether a campaign in `status` may be scheduled for `scheduledFor`.
export function checkSchedule(
  status: CampaignStatus,
  scheduledFor: string | null | undefined,
  now: Date = new Date()
): ScheduleCheck {
  if (!["draft", "scheduled", "paused"].includes(status)) {
    return { ok: false, error: `A ${status} campaign cannot be scheduled.` };
  }
  if (!scheduledFor) return { ok: false, error: "Pick a date and time first." };

  const at = new Date(scheduledFor);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "That is not a valid date and time." };

  if (at.getTime() - now.getTime() < MIN_LEAD_MS) {
    return { ok: false, error: "Pick a time at least 5 minutes from now." };
  }
  return { ok: true, at };
}

// Converts a <input type="datetime-local"> value, which has no zone, into an
// ISO string using the browser's zone. Returns null for an empty or invalid
// value.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// The inverse, for pre-filling the input from a stored schedule.
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "Tue, Sep 23 at 9:00 AM" in the studio's zone.
export function formatScheduled(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}
