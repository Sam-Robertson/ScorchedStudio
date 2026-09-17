// app/api/webhooks/sendblue/route.ts
//
// Sendblue is no longer the active provider (see lib/marketing/telnyx.ts for
// why), but this route is kept working so the provider can be revived for
// two-way iMessage conversations without rebuilding it.
//
// Handles both webhook types Sendblue posts here:
//
//   receive  - someone texted us. Log it, act on STOP/START, and forward real
//              questions to a human.
//   outbound - a delivery status update for something we sent.
//
// All of that logic now lives in lib/marketing/sms-inbound.ts, shared with the
// Telnyx route so the two cannot drift. Only signature verification and
// payload parsing are provider-specific.
//
// Returns 2xx as soon as the data is persisted. Sendblue retries on anything
// else, and a retry storm on a slow handler is worse than a dropped forward.
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { parseSendbluePayload } from "@/lib/marketing/sendblue";
import { mapSendblueStatus } from "@/lib/marketing/sms-status";
import {
  handleInboundSms,
  handleSmsStatusUpdate,
  logSmsMessage,
} from "@/lib/marketing/sms-inbound";

// Sendblue echoes the secret registered with the webhook rather than signing a
// digest of the body, so this is a constant-time equality check, not a
// signature verification like the Telnyx or Square routes do.
function signatureValid(req: NextRequest): boolean {
  const expected = process.env.SENDBLUE_WEBHOOK_SECRET;
  if (!expected) {
    console.error("SENDBLUE_WEBHOOK_NO_SECRET");
    return false;
  }
  const provided = req.headers.get("sb-signing-secret");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!signatureValid(req)) {
    console.error("SENDBLUE_WEBHOOK_SIG_ERROR");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = parseSendbluePayload(payload);

  try {
    await logSmsMessage(msg);

    if (msg.direction === "inbound") {
      await handleInboundSms(msg);
    } else {
      await handleSmsStatusUpdate(msg, mapSendblueStatus);
    }
  } catch (err) {
    // Persisting already happened or already failed and logged. Returning 500
    // here would make Sendblue retry the whole payload, so the error is
    // swallowed after logging.
    console.error("SENDBLUE_WEBHOOK_ERROR", err);
  }

  return Response.json({ ok: true });
}
