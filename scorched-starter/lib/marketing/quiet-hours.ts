// lib/marketing/quiet-hours.ts
//
// Texting someone at 2am is how a business gets reported. The TCPA's safe
// harbour is 8am to 9pm local; the defaults here (20 to 9) are tighter than
// that on both ends.
//
// The window is expressed in America/Denver, not UTC and not server local
// time, because "8pm" means 8pm where the studios are.
export const STUDIO_TIMEZONE = "America/Denver";

// Current hour (0 to 23) in the studio's timezone.
export function denverHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Intl can render midnight as "24" in some environments.
  return Number(hour) % 24;
}

// The window wraps midnight whenever start > end, which is the normal case:
// 20 to 9 means quiet from 8pm through 9am, crossing into the next day. A
// naive start <= h && h < end predicate gets this exactly backwards and would
// send only during the hours it was meant to protect.
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false; // no quiet period configured
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function isQuietNow(start: number, end: number, now: Date = new Date()): boolean {
  return isQuietHour(denverHour(now), start, end);
}

// When the quiet window next lifts, used to set send_after on anything the
// worker defers rather than leaving it to be retried every five minutes.
export function nextSendWindowStart(start: number, end: number, now: Date = new Date()): Date {
  if (!isQuietNow(start, end, now)) return now;

  const result = new Date(now);
  // Step forward an hour at a time rather than doing offset arithmetic, so
  // this stays correct across a daylight saving change.
  for (let i = 0; i < 48; i++) {
    result.setUTCHours(result.getUTCHours() + 1);
    if (!isQuietNow(start, end, result)) {
      result.setUTCMinutes(0, 0, 0);
      return result;
    }
  }
  return result;
}
