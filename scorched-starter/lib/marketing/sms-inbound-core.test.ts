import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStatusUpdate,
  decideInbound,
  type InboundDeps,
  type QueueRowRef,
  type StatusDeps,
} from "./sms-inbound-core.ts";
import { mapTelnyxStatus } from "./sms-status.ts";
import { parseTelnyxPayload } from "./telnyx.ts";
import type { InboundMessage } from "./sms-provider.ts";

function inbound(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    messageHandle: "msg-1",
    direction: "inbound",
    fromNumber: "+18015550123",
    toNumber: "+18015155172",
    content: "hello",
    mediaUrl: null,
    service: "SMS",
    status: null,
    errorCode: null,
    errorMessage: null,
    optedOut: false,
    occurredAt: null,
    raw: {},
    ...over,
  };
}

type Recorded = {
  statuses: { id: string; status: string; consentText: string }[];
  touched: string[];
  forwarded: InboundMessage[];
};

function inboundDeps(subscriberId: string | null = "sub-1"): InboundDeps & { recorded: Recorded } {
  const recorded: Recorded = { statuses: [], touched: [], forwarded: [] };
  return {
    recorded,
    findSubscriberIdByPhone: async () => subscriberId,
    setSmsStatus: async (id, status, consentText) => {
      recorded.statuses.push({ id, status, consentText });
    },
    touchLastContact: async (id) => { recorded.touched.push(id); },
    forwardToHuman: async (msg) => { recorded.forwarded.push(msg); },
  };
}

test("STOP flips the subscriber to unsubscribed and logs the consent wording", async () => {
  const deps = inboundDeps();
  const outcome = await decideInbound(inbound({ content: "STOP" }), deps);

  assert.equal(outcome, "opt_out");
  assert.equal(deps.recorded.statuses.length, 1);
  assert.equal(deps.recorded.statuses[0].status, "unsubscribed");
  assert.match(deps.recorded.statuses[0].consentText, /opt-out keyword/i);
  assert.equal(deps.recorded.forwarded.length, 0, "an opt-out must not be forwarded to a human");
});

test("every carrier-mandated stop word flips the status", async () => {
  for (const word of ["STOP", "stop", "Stop.", "unsubscribe", "cancel", "end", "quit", "revoke"]) {
    const deps = inboundDeps();
    assert.equal(await decideInbound(inbound({ content: word }), deps), "opt_out", `${word} failed`);
    assert.equal(deps.recorded.statuses[0]?.status, "unsubscribed");
  }
});

test("START re-subscribes and logs its own consent row", async () => {
  const deps = inboundDeps();
  const outcome = await decideInbound(inbound({ content: "START" }), deps);

  assert.equal(outcome, "opt_in");
  assert.equal(deps.recorded.statuses[0].status, "subscribed");
  assert.match(deps.recorded.statuses[0].consentText, /START/);
});

test("the provider's own opt-out flag is honoured even when the text is not a keyword", async () => {
  // Telnyx sets autoresponse_type on the inbound webhook when it recognises a
  // keyword we might not match. It is what actually blocks delivery, so our
  // record has to follow it.
  const deps = inboundDeps();
  const outcome = await decideInbound(inbound({ content: "stop all", optedOut: true }), deps);

  assert.equal(outcome, "opt_out");
  assert.equal(deps.recorded.statuses[0].status, "unsubscribed");
});

test("a real question is forwarded to a human, not treated as an opt-out", async () => {
  const deps = inboundDeps();
  const outcome = await decideInbound(inbound({ content: "can I stop by on Saturday?" }), deps);

  assert.equal(outcome, "forwarded");
  assert.equal(deps.recorded.statuses.length, 0, "must not change subscription status");
  assert.equal(deps.recorded.forwarded.length, 1);
  assert.deepEqual(deps.recorded.touched, ["sub-1"], "still counts as contact");
});

test("HELP is not forwarded, because the provider auto-replies to it", async () => {
  const deps = inboundDeps();
  assert.equal(await decideInbound(inbound({ content: "HELP" }), deps), "help");
  assert.equal(deps.recorded.forwarded.length, 0);
});

test("a message from a number we do not know is still forwarded", async () => {
  // Nobody to update, but a stranger texting the studio is exactly the case a
  // human needs to see.
  const deps = inboundDeps(null);
  const outcome = await decideInbound(inbound({ content: "are you open today?" }), deps);

  assert.equal(outcome, "forwarded");
  assert.equal(deps.recorded.statuses.length, 0);
  assert.equal(deps.recorded.forwarded.length, 1);
});

test("a STOP from an unknown number does not throw", async () => {
  const deps = inboundDeps(null);
  assert.equal(await decideInbound(inbound({ content: "STOP" }), deps), "opt_out");
  assert.equal(deps.recorded.statuses.length, 0);
});

test("a message with no sender is ignored rather than crashing the webhook", async () => {
  const deps = inboundDeps();
  assert.equal(await decideInbound(inbound({ fromNumber: null }), deps), "ignored");
});

test("a real Telnyx STOP payload flows through end to end", async () => {
  // Parsing and deciding together, so a change to either side is caught.
  const msg = parseTelnyxPayload({
    data: {
      event_type: "message.received",
      payload: {
        id: "msg-stop",
        from: { phone_number: "+18015550123" },
        to: [{ phone_number: "+18015155172" }],
        text: "STOP",
        autoresponse_type: "stop",
      },
    },
  });

  const deps = inboundDeps();
  assert.equal(await decideInbound(msg, deps), "opt_out");
  assert.equal(deps.recorded.statuses[0].status, "unsubscribed");
});

// ── Delivery status ──────────────────────────────────────────────────────────

function statusDeps(row: QueueRowRef | null) {
  const updates: { id: string; status: string; errorCode: string | null }[] = [];
  const deps: StatusDeps = {
    findQueueRowByHandle: async () => row,
    updateQueueRow: async (id, status, errorCode) => { updates.push({ id, status, errorCode }); },
  };
  return { deps, updates };
}

test("a delivery receipt moves the queue row forward", async () => {
  const { deps, updates } = statusDeps({ id: "q-1", status: "sent" });
  const msg = inbound({ direction: "outbound", messageHandle: "msg-out", status: "delivered" });

  assert.equal(await applyStatusUpdate(msg, mapTelnyxStatus, deps), "updated");
  assert.deepEqual(updates, [{ id: "q-1", status: "delivered", errorCode: null }]);
});

test("a failure is recorded with its Telnyx error code", async () => {
  const { deps, updates } = statusDeps({ id: "q-1", status: "sent" });
  const msg = inbound({
    direction: "outbound",
    messageHandle: "msg-out",
    status: "delivery_failed",
    errorCode: "40003",
    errorMessage: "Carrier rejected",
  });

  assert.equal(await applyStatusUpdate(msg, mapTelnyxStatus, deps), "updated");
  assert.equal(updates[0].status, "failed");
  assert.equal(updates[0].errorCode, "40003");
});

test("a late callback cannot drag a delivered row backwards", async () => {
  // Telnyx sends message.sent and message.finalized, and they can arrive out
  // of order. A 'queued' landing after 'delivered' must change nothing.
  const { deps, updates } = statusDeps({ id: "q-1", status: "delivered" });
  const msg = inbound({ direction: "outbound", messageHandle: "msg-out", status: "queued" });

  assert.equal(await applyStatusUpdate(msg, mapTelnyxStatus, deps), "ignored");
  assert.equal(updates.length, 0);
});

test("a stray callback never revives a skipped row", async () => {
  const { deps, updates } = statusDeps({ id: "q-1", status: "skipped" });
  const msg = inbound({ direction: "outbound", messageHandle: "msg-out", status: "delivered" });

  assert.equal(await applyStatusUpdate(msg, mapTelnyxStatus, deps), "ignored");
  assert.equal(updates.length, 0);
});

test("a callback for a message we have no queue row for is ignored", async () => {
  const { deps, updates } = statusDeps(null);
  const msg = inbound({ direction: "outbound", messageHandle: "unknown", status: "delivered" });

  assert.equal(await applyStatusUpdate(msg, mapTelnyxStatus, deps), "ignored");
  assert.equal(updates.length, 0);
});

test("an unmapped or missing status is ignored rather than guessed", async () => {
  const { deps, updates } = statusDeps({ id: "q-1", status: "sent" });

  assert.equal(
    await applyStatusUpdate(inbound({ messageHandle: "m", status: "something_new" }), mapTelnyxStatus, deps),
    "ignored"
  );
  assert.equal(
    await applyStatusUpdate(inbound({ messageHandle: null, status: "delivered" }), mapTelnyxStatus, deps),
    "ignored"
  );
  assert.equal(updates.length, 0);
});
