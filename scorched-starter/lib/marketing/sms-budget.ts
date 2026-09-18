// lib/marketing/sms-budget.ts
//
// How many messages a worker run may send, and how long a campaign will take.
//
// Telnyx on a registered 10DLC long code has no new-contact quota and no
// consecutive-outbound ceiling, so the only thing worth pacing is raw
// throughput: a 10DLC campaign's carrier-assigned rate starts low, and
// exceeding it gets messages filtered rather than queued.

// The cron interval the worker actually runs on. SMS_MAX_PER_MINUTE is a
// sustained rate, so one run may send that rate multiplied by the gap since
// the last run. Without this the real throughput would be a fifth of the
// number the setting appears to promise, and every estimate would be 5x wrong.
export const CRON_INTERVAL_MINUTES = 5;

export function maxMessagesPerRun(
  maxPerMinute: number,
  intervalMinutes: number = CRON_INTERVAL_MINUTES
): number {
  return Math.max(0, Math.floor(maxPerMinute * intervalMinutes));
}

// How many hours a day the worker is actually allowed to send, given quiet
// hours. With the default 20 to 9 window that is 11 hours, not 24, and ignoring
// it would overstate throughput by more than double.
export function sendingHoursPerDay(quietStart: number, quietEnd: number): number {
  if (quietStart === quietEnd) return 24;
  const quietHours = quietStart > quietEnd ? 24 - quietStart + quietEnd : quietEnd - quietStart;
  return Math.max(0, 24 - quietHours);
}

export type ThroughputEstimate = {
  pending: number;
  perDay: number;
  estimatedDays: number;
  estimatedCompletion: Date | null;
  limitedBy: "throughput" | "none";
};

export function estimateThroughputCompletion(
  pending: number,
  maxPerMinute: number,
  quietStart: number,
  quietEnd: number,
  now: Date = new Date()
): ThroughputEstimate {
  if (pending <= 0) {
    return { pending: 0, perDay: 0, estimatedDays: 0, estimatedCompletion: null, limitedBy: "none" };
  }

  const perDay = Math.floor(maxPerMinute * 60 * sendingHoursPerDay(quietStart, quietEnd));

  if (perDay <= 0) {
    // A cap of zero, or a quiet window covering the whole day, means this never
    // finishes. Reported as -1 rather than Infinity: it has to survive the trip
    // through JSON to the admin UI, and JSON.stringify turns Infinity into
    // null, which would render as "0 days" and read as "already done".
    return { pending, perDay: 0, estimatedDays: -1, estimatedCompletion: null, limitedBy: "throughput" };
  }

  const days = Math.ceil(pending / perDay);
  const completion = new Date(now);
  // A campaign that fits inside one sending day still finishes today.
  if (days > 1) completion.setDate(completion.getDate() + (days - 1));

  return {
    pending,
    perDay,
    estimatedDays: days,
    estimatedCompletion: completion,
    limitedBy: "throughput",
  };
}
