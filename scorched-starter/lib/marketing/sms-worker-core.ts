// lib/marketing/sms-worker-core.ts
//
// The worker's decision-making, with every dependency injected. No Supabase
// import, so the project's test runner can drive it directly and prove that
// two overlapping runs cannot send to the same person twice.
//
// What this file does NOT prove: that Postgres FOR UPDATE SKIP LOCKED is
// atomic. That cannot be tested without a database. The real guarantee is the
// UNIQUE (campaign_id, subscriber_id) constraint plus the conditional claim in
// claim_sms_queue_batch. This tests that, given an atomic claim, the budgeting
// and the re-check logic are correct.
import { computeBudget, type BudgetInputs } from "./sms-budget.ts";
import { isQuietHour } from "./quiet-hours.ts";

export type QueueItem = {
  id: string;
  campaignId: string;
  subscriberId: string;
  toNumber: string;
  body: string;
  isNewContact: boolean;
  attempts: number;
};

export type WorkerDeps = {
  // Takes the single-runner lease. Returns false when another run already
  // holds it, in which case this run does nothing at all.
  //
  // The row claim alone is not enough. It stops the same person being texted
  // twice, but two overlapping runs can still each read "0 sent this hour"
  // before either claims, and then each spend the full hourly allowance,
  // doubling the real send rate.
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  // Claims up to `limit` rows and flips them to 'sending' atomically. Returning
  // a row here means this run owns it and no other run will see it.
  claim: (limit: number, allowNewContact: boolean) => Promise<QueueItem[]>;
  // Re-read of sms_status immediately before sending, because someone may have
  // texted STOP after the row was enqueued.
  isStillSubscribed: (subscriberId: string) => Promise<boolean>;
  send: (item: QueueItem) => Promise<{
    ok: boolean;
    messageHandle: string | null;
    status: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    httpStatus?: number;
  }>;
  markSent: (item: QueueItem, handle: string | null, status: string | null) => Promise<void>;
  markSkipped: (item: QueueItem, reason: string) => Promise<void>;
  markFailed: (item: QueueItem, errorCode: string | null, errorMessage: string | null) => Promise<void>;
  retryLater: (item: QueueItem, sendAfter: Date, errorCode: string | null) => Promise<void>;
  markContacted: (subscriberId: string) => Promise<void>;
};

export type WorkerSettings = {
  budget: BudgetInputs;
  quietHoursStart: number;
  quietHoursEnd: number;
  currentHour: number;
  maxAttempts: number;
  backoffMs: (attempts: number) => number;
  isRetryable: (errorCode: string | null, httpStatus?: number) => boolean;
  now: Date;
};

export type WorkerRunResult = {
  skippedForQuietHours: boolean;
  lockedOut: boolean;
  blockedReason: string | null;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  newContactsUsed: number;
};

export async function runWorker(
  deps: WorkerDeps,
  settings: WorkerSettings
): Promise<WorkerRunResult> {
  const result: WorkerRunResult = {
    skippedForQuietHours: false,
    lockedOut: false,
    blockedReason: null,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
    newContactsUsed: 0,
  };

  // Quiet hours short-circuit before the lease is taken, so a run during the
  // night does not hold the lease it never needed.
  if (isQuietHour(settings.currentHour, settings.quietHoursStart, settings.quietHoursEnd)) {
    result.skippedForQuietHours = true;
    return result;
  }

  if (!(await deps.acquireLock())) {
    result.lockedOut = true;
    return result;
  }

  try {
    return await drain(deps, settings, result);
  } finally {
    await deps.releaseLock();
  }
}

async function drain(
  deps: WorkerDeps,
  settings: WorkerSettings,
  result: WorkerRunResult
): Promise<WorkerRunResult> {

  const budget = computeBudget(settings.budget);
  if (budget.blockedReason) {
    result.blockedReason = budget.blockedReason;
    return result;
  }
  if (budget.total <= 0) return result;

  // Established contacts first: they cost nothing from the new-contact pool,
  // so draining them before spending budget gets more messages out per run.
  const established = await deps.claim(budget.total, false);
  result.claimed += established.length;

  const remaining = Math.max(0, budget.total - established.length);
  const newAllowance = Math.min(remaining, budget.newContacts);
  const fresh = newAllowance > 0 ? await deps.claim(newAllowance, true) : [];

  // claim(limit, true) may also return established rows, so new contacts are
  // counted from the rows themselves rather than assumed.
  result.claimed += fresh.length;

  for (const item of [...established, ...fresh]) {
    // Re-checked per item, not per batch. Someone can text STOP between the
    // claim and this line, and a marketing text after an opt-out is exactly
    // the thing that gets a number blocked.
    const stillSubscribed = await deps.isStillSubscribed(item.subscriberId);
    if (!stillSubscribed) {
      await deps.markSkipped(item, "no longer subscribed at send time");
      result.skipped++;
      continue;
    }

    const send = await deps.send(item);

    if (send.ok) {
      await deps.markSent(item, send.messageHandle, send.status);
      await deps.markContacted(item.subscriberId);
      result.sent++;
      if (item.isNewContact) result.newContactsUsed++;
      continue;
    }

    const retryable = settings.isRetryable(send.errorCode, send.httpStatus);
    if (retryable && item.attempts < settings.maxAttempts) {
      const sendAfter = new Date(settings.now.getTime() + settings.backoffMs(item.attempts));
      await deps.retryLater(item, sendAfter, send.errorCode);
      result.retried++;
      continue;
    }

    await deps.markFailed(item, send.errorCode, send.errorMessage);
    result.failed++;
  }

  return result;
}
