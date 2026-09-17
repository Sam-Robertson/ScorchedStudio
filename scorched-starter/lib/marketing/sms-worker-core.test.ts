import test from "node:test";
import assert from "node:assert/strict";
import { runWorker, type QueueItem, type WorkerDeps, type WorkerSettings } from "./sms-worker-core.ts";
import { backoffMs, isRetryableError, MAX_ATTEMPTS } from "./sms-status.ts";

// A stand-in for sms_queue plus the claim_sms_queue_batch RPC.
//
// IMPORTANT about what this proves. The claim below is atomic because
// JavaScript is single threaded, not because this test verifies Postgres.
// FOR UPDATE SKIP LOCKED cannot be exercised without a database. What these
// tests do prove is that, GIVEN an atomic claim, the worker never sends to the
// same row twice, always re-checks consent, and respects the budget. The real
// database-level guarantee is the UNIQUE (campaign_id, subscriber_id)
// constraint plus the conditional update inside the RPC.
class FakeQueue {
  rows: Array<QueueItem & { status: string }> = [];
  sentTo: string[] = [];
  lockHeld = false;

  constructor(count: number, isNewContact = true) {
    for (let i = 0; i < count; i++) {
      this.rows.push({
        id: `row-${i}`,
        campaignId: "c1",
        subscriberId: `sub-${i}`,
        toNumber: `+1801555${String(i).padStart(4, "0")}`,
        body: "Scorched Studio: new classes are up. Reply STOP to opt out",
        isNewContact,
        attempts: 0,
        status: "pending",
      });
    }
  }

  claim = async (limit: number, allowNewContact: boolean): Promise<QueueItem[]> => {
    const claimed: QueueItem[] = [];
    for (const row of this.rows) {
      if (claimed.length >= limit) break;
      if (row.status !== "pending") continue;
      if (!allowNewContact && row.isNewContact) continue;
      row.status = "sending";
      row.attempts += 1;
      claimed.push({ ...row });
    }
    return claimed;
  };

  acquireLock = async (): Promise<boolean> => {
    if (this.lockHeld) return false;
    this.lockHeld = true;
    return true;
  };

  releaseLock = async (): Promise<void> => {
    this.lockHeld = false;
  };

  find(id: string) {
    return this.rows.find((r) => r.id === id)!;
  }
}

function deps(queue: FakeQueue, over: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    acquireLock: queue.acquireLock,
    releaseLock: queue.releaseLock,
    claim: queue.claim,
    isStillSubscribed: async () => true,
    send: async (item) => {
      queue.sentTo.push(item.id);
      return { ok: true, messageHandle: `h-${item.id}`, status: "QUEUED", errorCode: null, errorMessage: null };
    },
    markSent: async (item) => { queue.find(item.id).status = "sent"; },
    markSkipped: async (item) => { queue.find(item.id).status = "skipped"; },
    markFailed: async (item) => { queue.find(item.id).status = "failed"; },
    retryLater: async (item) => { queue.find(item.id).status = "pending"; },
    markContacted: async () => {},
    ...over,
  };
}

function settings(over: Partial<WorkerSettings> = {}): WorkerSettings {
  return {
    budget: {
      newContactsPerHour: 15,
      newContactsPerDay: 50,
      burstPerSecond: 10,
      newContactsSentLastHour: 0,
      newContactsSentLastDay: 0,
      runSeconds: 60,
      maxConsecutiveNoReply: 150,
      consecutiveNoReply: 0,
    },
    quietHoursStart: 20,
    quietHoursEnd: 9,
    currentHour: 12,
    maxAttempts: MAX_ATTEMPTS,
    backoffMs,
    isRetryable: isRetryableError,
    now: new Date("2026-09-17T18:00:00Z"),
    ...over,
  };
}

test("two overlapping runs never send to the same person twice", async () => {
  const queue = new FakeQueue(30);
  const d = deps(queue);

  // Both runs start before either finishes, which is exactly what happens when
  // a cron invocation overruns its five minute slot.
  const [a, b] = await Promise.all([runWorker(d, settings()), runWorker(d, settings())]);

  const unique = new Set(queue.sentTo);
  assert.equal(unique.size, queue.sentTo.length, "a row was sent more than once");
  assert.equal(a.sent + b.sent, queue.sentTo.length);
});

test("overlapping runs cannot each spend the full hourly allowance", async () => {
  // Without the lease this is the real failure: both runs read "0 new contacts
  // sent this hour" before either claims anything, so both send 15 and the
  // hour's true total is 30, double the cap Sendblue enforces.
  const queue = new FakeQueue(30);
  const d = deps(queue);

  const [a, b] = await Promise.all([runWorker(d, settings()), runWorker(d, settings())]);

  assert.equal(queue.sentTo.length, 15, "the hourly cap was exceeded across concurrent runs");
  assert.ok(a.lockedOut || b.lockedOut, "one of the two runs should have been locked out");
});

test("the lease is released even when the run throws", async () => {
  const queue = new FakeQueue(1);
  await assert.rejects(
    runWorker(deps(queue, { claim: async () => { throw new Error("boom"); } }), settings())
  );
  // A crashed run must not wedge every later run out of the queue.
  assert.equal(queue.lockHeld, false);
});

test("the hourly cap is not exceeded across several sequential runs", async () => {
  const queue = new FakeQueue(100);
  const d = deps(queue);

  await runWorker(d, settings());
  // A second run in the same hour sees the 15 already spent.
  await runWorker(d, settings({
    budget: { ...settings().budget, newContactsSentLastHour: 15 },
  }));

  assert.equal(queue.sentTo.length, 15, "the second run must send nothing");
});

test("someone who texted STOP after being queued is skipped, not sent to", async () => {
  const queue = new FakeQueue(5);
  const optedOut = new Set(["sub-1", "sub-3"]);

  const result = await runWorker(
    deps(queue, { isStillSubscribed: async (id) => !optedOut.has(id) }),
    settings()
  );

  assert.equal(result.skipped, 2);
  assert.equal(result.sent, 3);
  assert.ok(!queue.sentTo.includes("row-1"));
  assert.ok(!queue.sentTo.includes("row-3"));
  assert.equal(queue.find("row-1").status, "skipped");
});

test("a consent check that errors fails closed", async () => {
  const queue = new FakeQueue(3);
  // The Supabase-backed implementation returns false when it cannot read the
  // status. Nothing should go out on an unreadable consent state.
  const result = await runWorker(deps(queue, { isStillSubscribed: async () => false }), settings());

  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 3);
  assert.equal(queue.sentTo.length, 0);
});

test("nothing is claimed at all during quiet hours", async () => {
  const queue = new FakeQueue(10);
  const result = await runWorker(deps(queue), settings({ currentHour: 2 }));

  assert.ok(result.skippedForQuietHours);
  assert.equal(result.claimed, 0);
  assert.equal(queue.sentTo.length, 0);
  // Leaving rows 'pending' rather than stranding them in 'sending' overnight.
  assert.ok(queue.rows.every((r) => r.status === "pending"));
});

test("the consecutive-no-reply ceiling stops the run before anything is claimed", async () => {
  const queue = new FakeQueue(10);
  const result = await runWorker(
    deps(queue),
    settings({ budget: { ...settings().budget, consecutiveNoReply: 150 } })
  );

  assert.match(result.blockedReason ?? "", /consecutive outbound/);
  assert.equal(result.claimed, 0);
  assert.equal(queue.sentTo.length, 0);
});

test("established contacts drain freely without spending new-contact budget", async () => {
  const queue = new FakeQueue(40, false); // nobody is a new contact
  const result = await runWorker(deps(queue), settings());

  // Not capped at 15: the new-contact cap only governs new conversations.
  assert.equal(result.sent, 40);
  assert.equal(result.newContactsUsed, 0);
});

test("a rate-limited send is retried later rather than failed", async () => {
  const queue = new FakeQueue(1);
  const result = await runWorker(
    deps(queue, {
      send: async () => ({
        ok: false,
        messageHandle: null,
        status: null,
        errorCode: "4001",
        errorMessage: "rate limited",
        httpStatus: 429,
      }),
    }),
    settings()
  );

  assert.equal(result.retried, 1);
  assert.equal(result.failed, 0);
  assert.equal(queue.find("row-0").status, "pending");
});

test("a permanent error fails immediately instead of burning retries", async () => {
  const queue = new FakeQueue(1);
  const result = await runWorker(
    deps(queue, {
      send: async () => ({
        ok: false,
        messageHandle: null,
        status: null,
        errorCode: "4002",
        errorMessage: "blacklisted",
        httpStatus: 400,
      }),
    }),
    settings()
  );

  assert.equal(result.failed, 1);
  assert.equal(result.retried, 0);
  assert.equal(queue.find("row-0").status, "failed");
});

test("a row that has exhausted its attempts fails instead of retrying forever", async () => {
  const queue = new FakeQueue(1);
  queue.rows[0].attempts = MAX_ATTEMPTS; // the claim will push it past the max

  const result = await runWorker(
    deps(queue, {
      send: async () => ({
        ok: false,
        messageHandle: null,
        status: null,
        errorCode: "4001",
        errorMessage: "rate limited",
        httpStatus: 429,
      }),
    }),
    settings()
  );

  assert.equal(result.failed, 1);
  assert.equal(result.retried, 0);
});
