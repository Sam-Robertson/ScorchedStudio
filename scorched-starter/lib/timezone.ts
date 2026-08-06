// lib/timezone.ts
// All studio date-boundary logic (renewal dates, period resets) must go through
// America/Denver, not raw UTC — a UTC crossover in the evening can push a display
// date into the next day. Mirrors the ymdInTimezone approach in app/admin/schedule.

export const STUDIO_TIMEZONE = "America/Denver";

// Formats a UTC instant as a long date in the studio's local timezone, e.g.
// "September 5, 2026" for a current_period_end that's technically
// 2026-09-06T02:00:00Z.
export function formatDenverDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}
