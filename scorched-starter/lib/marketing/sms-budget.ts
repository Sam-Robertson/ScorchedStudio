// lib/marketing/sms-budget.ts
//
// How many messages this worker run is allowed to send.
//
// Sendblue's Blue Ocean plan limits how many people you may *start* a
// conversation with, not how many messages you send. Someone we have exchanged
// a message with inside the last 30 days costs nothing from the new-contact
// budget; everyone else costs one from both the hourly and the daily pool.
//
// Every number comes from config. The documented figures are a starting point,
// not a contract, and Sam may negotiate different ones.

export type BudgetInputs = {
  newContactsPerHour: number;
  newContactsPerDay: number;
  burstPerSecond: number;
  // How many new-contact sends already went out in the trailing windows.
  newContactsSentLastHour: number;
  newContactsSentLastDay: number;
  // How long this run is willing to spend sending, in seconds. The burst limit
  // is per second, so the ceiling for one run is burst * seconds.
  runSeconds: number;
  // Sendblue stops delivering after this many consecutive outbound messages
  // on a line with no reply, and says the limit cannot be disabled.
  maxConsecutiveNoReply: number;
  consecutiveNoReply: number;
};

export type Budget = {
  // New conversations this run may start.
  newContacts: number;
  // Total messages this run may send, new and established together.
  total: number;
  // Set when the line is at the consecutive-no-reply ceiling, which no config
  // value can raise. The worker stops and surfaces this rather than sending
  // into a limit that silently drops messages.
  blockedReason: string | null;
};

export function computeBudget(input: BudgetInputs): Budget {
  const hourlyLeft = Math.max(0, input.newContactsPerHour - input.newContactsSentLastHour);
  const dailyLeft = Math.max(0, input.newContactsPerDay - input.newContactsSentLastDay);

  // The tighter of the two windows governs. Running the hourly pool dry early
  // in the day would otherwise let a burst blow past the daily cap.
  const newContacts = Math.min(hourlyLeft, dailyLeft);

  const total = Math.max(0, Math.floor(input.burstPerSecond * input.runSeconds));

  const blockedReason =
    input.consecutiveNoReply >= input.maxConsecutiveNoReply
      ? `line has ${input.consecutiveNoReply} consecutive outbound messages with no reply, at or past the ${input.maxConsecutiveNoReply} limit Sendblue enforces`
      : null;

  return {
    newContacts: blockedReason ? 0 : newContacts,
    total: blockedReason ? 0 : total,
    blockedReason,
  };
}

// How long a campaign will take to drain, given the queue and the caps. The
// admin UI shows this before anything is sent, because for an imported list
// (where everyone is a new contact) the honest answer is days, not minutes,
// and that needs to be obvious rather than a surprise.
export type CompletionEstimate = {
  pending: number;
  newContactsPending: number;
  // Whole days of drip, plus the leftover.
  estimatedDays: number;
  estimatedCompletion: Date | null;
  limitedBy: "new-contact-cap" | "burst" | "none";
};

export function estimateCompletion(
  pendingNewContacts: number,
  pendingEstablished: number,
  newContactsPerDay: number,
  now: Date = new Date()
): CompletionEstimate {
  const pending = pendingNewContacts + pendingEstablished;

  if (pending === 0) {
    return {
      pending: 0,
      newContactsPending: 0,
      estimatedDays: 0,
      estimatedCompletion: null,
      limitedBy: "none",
    };
  }

  // Established contacts drain inside a single run, so only the new-contact
  // pool sets the schedule.
  const days = newContactsPerDay > 0 ? Math.ceil(pendingNewContacts / newContactsPerDay) : 0;

  const completion = new Date(now);
  if (days > 0) completion.setDate(completion.getDate() + days);

  return {
    pending,
    newContactsPending: pendingNewContacts,
    estimatedDays: days,
    estimatedCompletion: days > 0 ? completion : now,
    limitedBy: days > 0 ? "new-contact-cap" : "burst",
  };
}

// ── Active path: throughput only ─────────────────────────────────────────────
//
// Everything above is Sendblue's model, kept because that provider is still in
// the tree and its limits would have to be re-derived otherwise. Nothing on the
// Telnyx path calls it.
//
// Telnyx with a registered 10DLC long code has no new-contact quota and no
// consecutive-outbound ceiling. The only thing worth pacing is raw throughput,
// because a 10DLC campaign's carrier-assigned rate starts low and exceeding it
// gets messages filtered rather than queued.

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
