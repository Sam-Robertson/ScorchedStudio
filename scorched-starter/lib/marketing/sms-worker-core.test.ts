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
// same row twice, always re-checks consent, and respects the cap. The real
// database-level guarantee is the UNIQUE (campaign_id, subscriber_id)
// constraint plus the conditional update inside the RPC.
class FakeQueue {
  rows: Array<QueueItem & { status: string }> = [];
  sentTo: string[] = [];
  contacted: string[] = [];
  optedOut: string[] = [];
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

  claim = async (limit: number): Promise<QueueItem[]> => {
    const claimed: QueueItem[] = [];
    for (const row of this.rows) {
      if (claimed.length >= limit) break;
      if (row.status !== "pending") continue;
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
    markContacted: async (id: string) => { queue.contacted.push(id); },
    markSkipped: async (item) => { queue.find(item.id).status = "skipped"; },
    markFailed: async (item) => { queue.find(item.id).status = "failed"; },
    markOptedOut: async (item) => {
      queue.find(item.id).status = "skipped";
      queue.optedOut.push(item.subscriberId);
    },
    retryLater: async (item) => { queue.find(item.id).status = "pending"; },
    ...over,
  };
}

function settings(over: Partial<WorkerSettings> = {}): WorkerSettings {
  return {
    // 12 a minute over a 5 minute cron interval, which is what the Telnyx
    // path actually computes.
    maxThisRun: 60,
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

test("overlapping runs cannot each spend the full throughput allowance", async () => {
  // Without the lease both runs pace themselves against their own view of the
  // queue and together send double the cap, which for a 10DLC campaign means
  // carrier filtering rather than a queue.
  const queue = new FakeQueue(200);
  const d = deps(queue);

  const [a, b] = await Promise.all([runWorker(d, settings()), runWorker(d, settings())]);

  assert.equal(queue.sentTo.length, 60, "the per-run cap was exceeded across concurrent runs");
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

test("each run sends at most the throughput cap, and the rest waits", async () => {
  const queue = new FakeQueue(200);
  const d = deps(queue);

  await runWorker(d, settings());
  assert.equal(queue.sentTo.length, 60, "first run must stop at the cap");

  // The next cron tick picks up where it left off rather than re-sending.
  await runWorker(d, settings());
  assert.equal(queue.sentTo.length, 120);
  assert.equal(new Set(queue.sentTo).size, 120, "no row was sent twice across runs");
});

test("a campaign smaller than the cap finishes in one run", async () => {
  const queue = new FakeQueue(12);
  const result = await runWorker(deps(queue), settings());
  assert.equal(result.sent, 12);
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

test("a cold list is no longer throttled by new-contact status", async () => {
  // The whole reason for the provider swap: under the old provider a list of
  // 40 people nobody had texted before was capped at 15 an hour and 50 a day.
  // On a registered 10DLC long code the distinction does not exist.
  const queue = new FakeQueue(40, true); // everyone is a new contact
  const result = await runWorker(deps(queue), settings());

  assert.equal(result.sent, 40);
  assert.equal(result.newContactsUsed, 40);
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

test("a suppressed send does not mark anyone as contacted", async () => {
  // The trap this guards against: with MARKETING_LIVE off, the provider
  // returns ok so the pipeline can be exercised. If that stamped
  // last_sms_contact_at, everyone would count as an established contact for
  // the next 30 days, so the real campaign afterwards would skip the
  // new-contact cap entirely and fire at full burst into a list that is
  // actually cold. SETUP.md explicitly tells Sam to do a suppressed run first,
  // so this path is the expected one, not an edge case.
  const queue = new FakeQueue(5);
  const result = await runWorker(
    deps(queue, {
      send: async (item) => {
        queue.sentTo.push(item.id);
        return {
          ok: true,
          messageHandle: `suppressed-${item.id}`,
          status: "QUEUED",
          errorCode: null,
          errorMessage: null,
          suppressed: true,
        };
      },
    }),
    settings()
  );

  assert.equal(result.sent, 5);
  assert.equal(result.suppressed, 5);
  assert.deepEqual(queue.contacted, [], "a suppressed run must not stamp last_sms_contact_at");
});

test("a real send does mark contact, so the next campaign budgets correctly", async () => {
  const queue = new FakeQueue(3);
  const result = await runWorker(deps(queue), settings());

  assert.equal(result.suppressed, 0);
  assert.equal(queue.contacted.length, 3);
});

test("a recipient the provider says opted out is skipped, not failed", async () => {
  // Telnyx returns 40300 when the number texted STOP. That is our record being
  // stale, not a delivery failure: retrying would be pointless, and succeeding
  // would mean texting someone who asked us not to.
  const queue = new FakeQueue(3);
  const result = await runWorker(
    deps(queue, {
      send: async (item) => {
        if (item.id !== "row-1") {
          queue.sentTo.push(item.id);
          return { ok: true, messageHandle: `h-${item.id}`, status: "queued", errorCode: null, errorMessage: null };
        }
        return {
          ok: false,
          messageHandle: null,
          status: null,
          errorCode: "40300",
          errorMessage: "Blocked due to STOP message",
          httpStatus: 403,
          optedOut: true,
        };
      },
    }),
    settings()
  );

  assert.equal(result.optedOut, 1);
  assert.equal(result.failed, 0, "an opt-out must not be recorded as a failure");
  assert.equal(result.retried, 0, "an opt-out must never be retried");
  assert.equal(result.sent, 2);
  assert.equal(queue.find("row-1").status, "skipped");
  // The subscriber is corrected too, so Supabase stops disagreeing with the
  // provider about who may be messaged.
  assert.deepEqual(queue.optedOut, ["sub-1"]);
});
