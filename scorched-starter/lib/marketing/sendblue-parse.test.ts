import test from "node:test";
import assert from "node:assert/strict";
import { parseSendbluePayload } from "./sendblue.ts";

// Payload shapes taken from Sendblue's own documented examples.
const inboundExample = {
  accountEmail: "hello@scorchedstudio.com",
  content: "Hello!",
  is_outbound: false,
  status: "RECEIVED",
  error_code: null,
  error_message: null,
  message_handle: "99DCC379-DD76-4712-BA65-11EFB33B8CD6",
  date_sent: "2026-09-12T15:41:20.932Z",
  from_number: "+19998887777",
  to_number: "+15122164639",
  was_downgraded: null,
  service: "iMessage",
  media_url: "",
  opted_out: false,
};

test("an inbound message parses into the shape the webhook stores", () => {
  const msg = parseSendbluePayload(inboundExample);

  assert.equal(msg.direction, "inbound");
  assert.equal(msg.fromNumber, "+19998887777");
  assert.equal(msg.toNumber, "+15122164639");
  assert.equal(msg.content, "Hello!");
  assert.equal(msg.service, "iMessage");
  assert.equal(msg.messageHandle, "99DCC379-DD76-4712-BA65-11EFB33B8CD6");
  assert.equal(msg.occurredAt, "2026-09-12T15:41:20.932Z");
  assert.equal(msg.optedOut, false);
});

test("an empty media_url becomes null rather than an empty string", () => {
  assert.equal(parseSendbluePayload(inboundExample).mediaUrl, null);
});

test("is_outbound decides direction", () => {
  assert.equal(parseSendbluePayload({ ...inboundExample, is_outbound: true }).direction, "outbound");
  // Absent means inbound, which is the safe reading for a receive webhook.
  assert.equal(parseSendbluePayload({ content: "hi" }).direction, "inbound");
});

test("the provider's own opt-out flag is carried through", () => {
  // Authoritative even when the text does not look like a keyword.
  const msg = parseSendbluePayload({ ...inboundExample, content: "no thanks", opted_out: true });
  assert.equal(msg.optedOut, true);
});

test("service maps onto the values the column allows", () => {
  assert.equal(parseSendbluePayload({ service: "iMessage" }).service, "iMessage");
  assert.equal(parseSendbluePayload({ service: "SMS" }).service, "SMS");
  assert.equal(parseSendbluePayload({ service: "RCS" }).service, "RCS");
  // Unknown transports store as null, because sms_messages.service has a CHECK
  // and an unexpected string would fail the insert.
  assert.equal(parseSendbluePayload({ service: "carrier-pigeon" }).service, null);
  assert.equal(parseSendbluePayload({}).service, null);
});

test("a numeric error code is stringified for the text column", () => {
  const msg = parseSendbluePayload({ ...inboundExample, error_code: 4001, error_message: "rate limited" });
  assert.equal(msg.errorCode, "4001");
  assert.equal(msg.errorMessage, "rate limited");
});

test("error_reason is used when error_message is absent", () => {
  const msg = parseSendbluePayload({ error_reason: "carrier rejected" });
  assert.equal(msg.errorMessage, "carrier rejected");
});

test("a status callback parses without an inbound body", () => {
  const msg = parseSendbluePayload({
    is_outbound: true,
    status: "DELIVERED",
    message_handle: "handle-123",
    to_number: "+18015550000",
    error_code: null,
  });

  assert.equal(msg.direction, "outbound");
  assert.equal(msg.status, "DELIVERED");
  assert.equal(msg.messageHandle, "handle-123");
  assert.equal(msg.errorCode, null);
});

test("junk payloads do not throw", () => {
  // A webhook handler that throws on an unexpected shape makes Sendblue retry
  // forever. Parsing has to be total.
  for (const junk of [null, undefined, {}, { content: 123 }, []]) {
    assert.doesNotThrow(() => parseSendbluePayload(junk));
  }
  assert.equal(parseSendbluePayload(null).content, null);
  assert.equal(parseSendbluePayload({ content: 123 }).content, null);
});
