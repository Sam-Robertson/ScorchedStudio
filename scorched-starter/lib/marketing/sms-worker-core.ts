// lib/marketing/sms-worker-core.ts
//
// The worker's decision-making, with every dependency injected. No Supabase
// import, so the project's test runner can drive it directly.
//
// What this file does NOT prove: that Postgres FOR UPDATE SKIP LOCKED is
// atomic. That cannot be tested without a database. The real guarantee is the
// UNIQUE (campaign_id, subscriber_id) constraint plus the conditional claim in
// claim_sms_queue_batch, with the single-runner lease on top. This tests that,
// given an atomic claim, the pacing and the consent re-check are correct.
//
// Rate limiting is a single throughput cap: the caller works out how many
// messages this run may send and passes it in.
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
  // The row claim alone is not enough: two overlapping runs would each pace
  // themselves against their own view of the queue and together exceed the cap.
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  // Claims up to `limit` rows and flips them to 'sending' atomically. Returning
  // a row here means this run owns it and no other run will see it.
  claim: (limit: number) => Promise<QueueItem[]>;
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
    // True when MARKETING_LIVE was off and nothing actually left the building.
    suppressed?: boolean;
    // The provider refused because this person is on its opt-out list.
    optedOut?: boolean;
  }>;
  markSent: (
    item: QueueItem,
    handle: string | null,
    status: string | null,
    suppressed: boolean
  ) => Promise<void>;
  markSkipped: (item: QueueItem, reason: string) => Promise<void>;
  markFailed: (item: QueueItem, errorCode: string | null, errorMessage: string | null) => Promise<void>;
  // The provider says this person opted out. Corrects our record as well as the
  // queue row, so Supabase stops disagreeing with the provider.
  markOptedOut: (item: QueueItem, reason: string) => Promise<void>;
  retryLater: (item: QueueItem, sendAfter: Date, errorCode: string | null) => Promise<void>;
  markContacted: (subscriberId: string) => Promise<void>;
};

export type WorkerSettings = {
  // How many messages this run may send, computed by the caller from the
  // configured throughput cap and the cron interval.
  maxThisRun: number;
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
  claimed: number;
  sent: number;
  skipped: number;
  optedOut: number;
  failed: number;
  retried: number;
  newContactsUsed: number;
  suppressed: number;
};

export async function runWorker(
  deps: WorkerDeps,
  settings: WorkerSettings
): Promise<WorkerRunResult> {
  const result: WorkerRunResult = {
    skippedForQuietHours: false,
    lockedOut: false,
    claimed: 0,
    sent: 0,
    skipped: 0,
    optedOut: 0,
    failed: 0,
    retried: 0,
    newContactsUsed: 0,
    suppressed: 0,
  };

  // Quiet hours short-circuit before the lease is taken, so a night run does
  // not hold a lease it never needed, and nothing is claimed, which keeps rows
  // out of 'sending' overnight.
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
  if (settings.maxThisRun <= 0) return result;

  const claimed = await deps.claim(settings.maxThisRun);
  result.claimed = claimed.length;

  for (const item of claimed) {
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
      await deps.markSent(item, send.messageHandle, send.status, send.suppressed === true);

      // Only a message that genuinely went out counts as contact. Stamping
      // last_sms_contact_at on a suppressed run would record a conversation
      // that never happened.
      if (!send.suppressed) await deps.markContacted(item.subscriberId);

      result.sent++;
      if (send.suppressed) result.suppressed++;
      if (item.isNewContact) result.newContactsUsed++;
      continue;
    }

    // The provider knows this person opted out and we did not. That is our
    // record being stale, not a delivery failure: the row is skipped and the
    // subscriber corrected. Retrying would be pointless, and succeeding would
    // be a compliance problem.
    if (send.optedOut) {
      await deps.markOptedOut(item, send.errorMessage ?? "recipient has opted out at the provider");
      result.optedOut++;
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
