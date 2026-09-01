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

// Today's calendar date in the studio's timezone — a report run at 11pm Denver
// shouldn't be compared against "today" in UTC, which is already tomorrow.
export function todayInDenver(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

// "YYYY-MM" for the previous calendar month in Denver. Deliberately the
// previous *calendar* month, not "the most recent month with data" — if an
// upload is skipped, callers should see "no data for <month>" rather than
// silently falling back to stale older data.
export function previousMonthKey(): string {
  const { y, m } = todayInDenver();
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

// Number of days in a "YYYY-MM" month (pure calendar math via Date.UTC, not
// affected by browser/server local timezone).
export function daysInMonthKey(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Which Denver calendar date a UTC instant falls on, e.g. "2026-08-25T03:06Z"
// (9:06pm Mountain the evening before) -> "2026-08-24", not "2026-08-25".
// Square timestamps are always UTC; bucketing daily revenue by raw UTC date
// would misattribute every evening sale to the next day.
export function denverDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// The UTC instant range [start, end) that covers one full Denver calendar
// day, for passing to APIs (like Square's) that take UTC begin/end times.
// Computed from the actual Denver UTC offset on that date rather than a
// fixed -6/-7, so it's correct across the DST boundary.
export function denverDayRangeUTC(dateStr: string): { startUTC: string; endUTC: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const noonProbe = new Date(Date.UTC(y, m - 1, d, 12)); // safely inside the same local day year-round
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(noonProbe)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-6"
  const offsetHours = parseInt(offsetName.replace("GMT", ""), 10);
  const startUTC = new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0));
  const endUTC = new Date(Date.UTC(y, m - 1, d + 1, -offsetHours, 0, 0));
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
}

// Whole days between a "YYYY-MM-DD" date and today in Denver.
export function daysSinceDenver(isoDate: string): number {
  const [sy, sm, sd] = isoDate.split("-").map(Number);
  const startUTC = Date.UTC(sy, sm - 1, sd);
  const { y, m, d } = todayInDenver();
  const todayUTC = Date.UTC(y, m - 1, d);
  return Math.round((todayUTC - startUTC) / 86400000);
}
