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
