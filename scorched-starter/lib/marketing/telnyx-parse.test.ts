import test from "node:test";
import assert from "node:assert/strict";
import { parseTelnyxPayload, TELNYX_INBOUND_EVENT, TELNYX_STATUS_EVENTS } from "./telnyx.ts";
import { isTelnyxOptedOutError, mapTelnyxStatus, TELNYX_STATUSES } from "./sms-status.ts";

// Payload shapes follow Telnyx's documented examples. The nesting is the part
// worth pinning: the sender is at payload.from.phone_number and the status is
// inside the payload.to array, not at the top level like Sendblue.

const inbound = {
  data: {
    event_type: "message.received",
    id: "evt-1",
    payload: {
      id: "msg-abc",
      direction: "inbound",
      type: "SMS",
      from: { phone_number: "+18015550123", carrier: "Verizon" },
      to: [{ phone_number: "+18015155172", status: "webhook_delivered" }],
      text: "what time do you open?",
      encoding: "GSM-7",
      media: [],
      errors: [],
      received_at: "2026-09-17T15:41:20.932Z",
    },
  },
};

const finalized = {
  data: {
    event_type: "message.finalized",
    payload: {
      id: "msg-out-1",
      direction: "outbound",
      from: { phone_number: "+18015155172" },
      to: [{ phone_number: "+18015550123", status: "delivered" }],
      text: "Scorched Studio: new classes are up. Reply STOP to opt out",
      errors: [],
      completed_at: "2026-09-17T15:42:00.000Z",
    },
  },
};

test("an inbound message parses out of Telnyx's nesting", () => {
  const msg = parseTelnyxPayload(inbound);

  assert.equal(msg.eventType, "message.received");
  assert.equal(msg.direction, "inbound");
  assert.equal(msg.fromNumber, "+18015550123", "sender is nested under from.phone_number");
  assert.equal(msg.toNumber, "+18015155172", "recipient is the first entry of the to array");
  assert.equal(msg.content, "what time do you open?");
  assert.equal(msg.messageHandle, "msg-abc");
  assert.equal(msg.occurredAt, "2026-09-17T15:41:20.932Z");
  assert.equal(msg.service, "SMS");
  assert.equal(msg.optedOut, false);
});

test("a delivery receipt carries the per-recipient status", () => {
  const msg = parseTelnyxPayload(finalized);

  assert.equal(msg.eventType, "message.finalized");
  assert.equal(msg.direction, "outbound");
  assert.equal(msg.messageHandle, "msg-out-1");
  assert.equal(msg.status, "delivered", "status lives inside the to array");
  assert.equal(msg.errorCode, null);
});

test("autoresponse_type is what tells us Telnyx already acted on a keyword", () => {
  // Telnyx runs its own opt-out list. When it recognises STOP it blocks the
  // number itself and flags the inbound webhook, and our record has to follow
  // that rather than rely on matching the text ourselves.
  const stop = parseTelnyxPayload({
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

  assert.equal(stop.optedOut, true);
});

test("a start keyword is not mistaken for an opt-out", () => {
  const start = parseTelnyxPayload({
    data: {
      event_type: "message.received",
      payload: {
        id: "msg-start",
        from: { phone_number: "+18015550123" },
        text: "START",
        autoresponse_type: "start",
      },
    },
  });

  assert.equal(start.optedOut, false);
});

test("delivery errors are surfaced with their code", () => {
  const failed = parseTelnyxPayload({
    data: {
      event_type: "message.finalized",
      payload: {
        id: "msg-fail",
        direction: "outbound",
        to: [{ phone_number: "+18015550123", status: "delivery_failed" }],
        errors: [{ code: 40003, title: "Destination unreachable", detail: "Carrier rejected" }],
      },
    },
  });

  assert.equal(failed.status, "delivery_failed");
  assert.equal(failed.errorCode, "40003", "numeric codes are stringified for the text column");
  assert.equal(failed.errorMessage, "Carrier rejected");
});

test("MMS media is reduced to the single URL our log stores", () => {
  const mms = parseTelnyxPayload({
    data: {
      event_type: "message.received",
      payload: {
        id: "msg-mms",
        from: { phone_number: "+18015550123" },
        type: "MMS",
        media: [{ url: "https://example.com/a.jpg", content_type: "image/jpeg", size: 1234 }],
      },
    },
  });

  assert.equal(mms.mediaUrl, "https://example.com/a.jpg");
  assert.equal(parseTelnyxPayload(inbound).mediaUrl, null, "an empty media array is null");
});

test("junk payloads do not throw", () => {
  // A webhook handler that throws on an unexpected shape makes Telnyx retry
  // forever, so parsing has to be total.
  for (const junk of [null, undefined, {}, { data: null }, { data: { payload: 5 } }, []]) {
    assert.doesNotThrow(() => parseTelnyxPayload(junk));
  }
  assert.equal(parseTelnyxPayload(null).content, null);
  assert.equal(parseTelnyxPayload({}).eventType, null);
});

test("every documented Telnyx status maps to a queue status", () => {
  for (const status of TELNYX_STATUSES) {
    assert.ok(mapTelnyxStatus(status), `${status} is unmapped`);
  }
});

test("Telnyx statuses map onto the right queue states", () => {
  assert.equal(mapTelnyxStatus("queued"), "sending");
  assert.equal(mapTelnyxStatus("sending"), "sending");
  assert.equal(mapTelnyxStatus("sent"), "sent");
  assert.equal(mapTelnyxStatus("delivered"), "delivered");
  assert.equal(mapTelnyxStatus("sending_failed"), "failed");
  assert.equal(mapTelnyxStatus("delivery_failed"), "failed");
  // The carrier never confirmed either way. The message did leave Telnyx, so
  // calling it a failure would under-report delivery and invite a resend to
  // someone who already got it.
  assert.equal(mapTelnyxStatus("delivery_unconfirmed"), "sent");
});

test("status matching is case and whitespace tolerant, and unknowns are null", () => {
  assert.equal(mapTelnyxStatus("DELIVERED"), "delivered");
  assert.equal(mapTelnyxStatus("  delivered  "), "delivered");
  assert.equal(mapTelnyxStatus("something_new"), null);
  assert.equal(mapTelnyxStatus(null), null);
});

test("40300 is recognised as the opted-out refusal", () => {
  // Telnyx blocks opted-out numbers at the messaging profile level and returns
  // this rather than delivering. It is the signal that our record is stale.
  assert.ok(isTelnyxOptedOutError("40300"));
  assert.ok(isTelnyxOptedOutError(" 40300 "));
  assert.ok(!isTelnyxOptedOutError("40003"));
  assert.ok(!isTelnyxOptedOutError(null));
});

test("the route's event routing covers what Telnyx actually sends", () => {
  assert.equal(TELNYX_INBOUND_EVENT, "message.received");
  assert.ok(TELNYX_STATUS_EVENTS.includes("message.sent"));
  assert.ok(TELNYX_STATUS_EVENTS.includes("message.finalized"));
});
