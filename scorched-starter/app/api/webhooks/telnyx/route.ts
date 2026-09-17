// app/api/webhooks/telnyx/route.ts
//
// Receives everything Telnyx sends about messaging:
//
//   message.received   - someone texted us. Log it, act on STOP/START, and
//                        forward real questions to a human.
//   message.sent       - accepted by the carrier.
//   message.finalized  - terminal delivery state, success or failure.
//
// The handling itself is shared with the Sendblue route via
// lib/marketing/sms-inbound.ts. Only signature verification and payload shape
// are provider-specific.
//
// Returns 2xx as soon as the data is persisted. Telnyx retries on anything
// else, and a retry storm on a slow handler is worse than a dropped forward.
import { NextRequest } from "next/server";
import {
  parseTelnyxPayload,
  TELNYX_INBOUND_EVENT,
  TELNYX_STATUS_EVENTS,
} from "@/lib/marketing/telnyx";
import { mapTelnyxStatus } from "@/lib/marketing/sms-status";
import {
  handleInboundSms,
  handleSmsStatusUpdate,
  logSmsMessage,
} from "@/lib/marketing/sms-inbound";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyTelnyxSignature,
} from "@/lib/marketing/telnyx-webhook";

export async function POST(req: NextRequest) {
  // Must be the raw bytes: the signature covers exactly what was sent, so
  // parsing and re-serializing would break verification.
  const rawBody = await req.text();

  const result = verifyTelnyxSignature({
    rawBody,
    signature: req.headers.get(SIGNATURE_HEADER),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    publicKeyBase64: process.env.TELNYX_PUBLIC_KEY,
  });

  if (!result.ok) {
    console.error("TELNYX_WEBHOOK_REJECTED", result.reason);
    // A stale timestamp is a replay, not a malformed request, but both are
    // refusals to act rather than server faults.
    return Response.json({ error: result.reason }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = parseTelnyxPayload(payload);

  try {
    await logSmsMessage(msg);

    if (msg.eventType === TELNYX_INBOUND_EVENT) {
      await handleInboundSms(msg);
    } else if (msg.eventType && TELNYX_STATUS_EVENTS.includes(msg.eventType)) {
      await handleSmsStatusUpdate(msg, mapTelnyxStatus);
    } else {
      // Telnyx sends other event types on the same endpoint. Acknowledged and
      // ignored rather than 4xx'd, so it does not retry something we simply
      // do not act on.
      console.info("TELNYX_WEBHOOK_IGNORED_EVENT", msg.eventType);
    }
  } catch (err) {
    console.error("TELNYX_WEBHOOK_ERROR", err);
  }

  return Response.json({ ok: true });
}
