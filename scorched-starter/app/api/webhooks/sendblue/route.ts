// app/api/webhooks/sendblue/route.ts
//
// Handles both webhook types Sendblue posts here:
//
//   receive  - someone texted us. Log it, act on STOP/START, and forward real
//              questions to a human.
//   outbound - a delivery status update for something we sent.
//
// Returns 2xx as soon as the data is persisted. Sendblue retries on anything
// else, and a retry storm on a slow handler is worse than a dropped forward.
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueRecord, SubscriberRecord } from "@/lib/supabase";
import { parseSendbluePayload } from "@/lib/marketing/sendblue";
import { classifyInbound } from "@/lib/marketing/sms-keywords";
import { mapSendblueStatus, shouldAdvanceStatus } from "@/lib/marketing/sms-status";
import { SMS_START_CONSENT_TEXT, SMS_STOP_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { marketingIsLive, logSuppressedSend } from "@/lib/marketing/config";
import type { InboundMessage } from "@/lib/marketing/sms-provider";

const FORWARD_TO = "contact@scorchedstudio.com";

// Sendblue echoes the secret registered with the webhook rather than signing a
// digest of the body, so this is a constant-time equality check, not an HMAC
// verification like the Square webhook does.
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

async function logMessage(msg: InboundMessage): Promise<void> {
  const sb = getSupabase();
  const row = {
    provider_message_handle: msg.messageHandle,
    direction: msg.direction,
    from_number: msg.fromNumber,
    to_number: msg.toNumber,
    content: msg.content,
    media_url: msg.mediaUrl,
    service: msg.service,
    status: msg.status,
    error_code: msg.errorCode,
    error_message: msg.errorMessage,
    raw_payload: msg.raw,
    occurred_at: msg.occurredAt,
  };

  // Upsert rather than insert: Sendblue retries, and a duplicate delivery must
  // not create a second log row.
  const { error } = msg.messageHandle
    ? await sb.from("sms_messages").upsert(row, { onConflict: "provider_message_handle" })
    : await sb.from("sms_messages").insert(row);

  if (error) console.error("SMS_MESSAGE_LOG_ERROR", error);
}

async function findSubscriberByPhone(phone: string): Promise<SubscriberRecord | null> {
  const { data, error } = await getSupabase()
    .from("subscribers")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("SUBSCRIBER_LOOKUP_ERROR", error);
    return null;
  }
  return (data as SubscriberRecord | null) ?? null;
}

async function setSmsStatus(
  subscriber: SubscriberRecord,
  status: "subscribed" | "unsubscribed",
  consentText: string
): Promise<void> {
  const sb = getSupabase();

  const { error } = await sb
    .from("subscribers")
    .update({ sms_status: status, last_sms_contact_at: new Date().toISOString() })
    .eq("id", subscriber.id);
  if (error) {
    console.error("SMS_STATUS_UPDATE_ERROR", error);
    return;
  }

  const { error: logError } = await sb.from("consent_events").insert({
    subscriber_id: subscriber.id,
    channel: "sms",
    action: status === "subscribed" ? "opt_in" : "opt_out",
    source: "inbound_keyword",
    consent_text: consentText,
  });
  if (logError) console.error("CONSENT_LOG_ERROR", logError);
}

// People reply to marketing texts with real questions. Without this they go
// into a table nobody reads.
async function forwardToHuman(msg: InboundMessage): Promise<void> {
  if (!marketingIsLive()) {
    logSuppressedSend("sms-reply-forward", { from: msg.fromNumber, content: msg.content });
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  try {
    await new Resend(key).emails.send({
      from: process.env.CONTACT_FROM || "Scorched Studio <bookings@scorchedstudio.com>",
      to: FORWARD_TO,
      replyTo: FORWARD_TO,
      subject: `Text reply from ${msg.fromNumber ?? "unknown number"}`,
      html: `<div style="font-family: system-ui, sans-serif; color:#3A3A3A;">
        <p style="color:#888; font-size:12px;">Someone replied to a Scorched Studio text. This is not an opt-out keyword, so it needs a human.</p>
        <p><strong>From:</strong> ${msg.fromNumber ?? "unknown"}</p>
        <p><strong>Sent:</strong> ${msg.occurredAt ?? "unknown"}</p>
        <p style="background:#f5f5f5; padding:12px; border-radius:8px; white-space:pre-wrap;">${
          (msg.content ?? "").replace(/</g, "&lt;")
        }</p>
        ${msg.mediaUrl ? `<p><a href="${msg.mediaUrl}">Attached media</a> (expires after 30 days)</p>` : ""}
      </div>`,
    });
  } catch (err) {
    console.error("SMS_FORWARD_ERROR", err);
  }
}

async function handleInbound(msg: InboundMessage): Promise<void> {
  if (!msg.fromNumber) return;

  const subscriber = await findSubscriberByPhone(msg.fromNumber);
  const intent = classifyInbound(msg.content);

  // The provider's own opted_out flag is authoritative even when the text does
  // not look like a keyword, so it is checked alongside our own matching.
  if (intent === "opt_out" || msg.optedOut) {
    if (subscriber) await setSmsStatus(subscriber, "unsubscribed", SMS_STOP_CONSENT_TEXT);
    return;
  }

  if (intent === "opt_in") {
    if (subscriber) await setSmsStatus(subscriber, "subscribed", SMS_START_CONSENT_TEXT);
    return;
  }

  // Any other inbound message still counts as contact, which is what keeps
  // this person out of the "new contact" bucket for rate limiting.
  if (subscriber) {
    const { error } = await getSupabase()
      .from("subscribers")
      .update({ last_sms_contact_at: new Date().toISOString() })
      .eq("id", subscriber.id);
    if (error) console.error("LAST_CONTACT_UPDATE_ERROR", error);
  }

  // HELP is answered by the carrier's own auto-reply, so it does not need a
  // human, but a real question does.
  if (intent === "other") await forwardToHuman(msg);
}

async function handleStatusCallback(msg: InboundMessage): Promise<void> {
  if (!msg.messageHandle) return;

  const mapped = mapSendblueStatus(msg.status);
  if (!mapped) return;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sms_queue")
    .select("*")
    .eq("provider_message_handle", msg.messageHandle)
    .maybeSingle();

  if (error) {
    console.error("QUEUE_LOOKUP_ERROR", error);
    return;
  }
  const row = data as SmsQueueRecord | null;
  if (!row) return;

  // Callbacks can arrive out of order; a late QUEUED must not undo a DELIVERED.
  if (!shouldAdvanceStatus(row.status, mapped)) return;

  const { error: updateError } = await sb
    .from("sms_queue")
    .update({
      status: mapped,
      error_code: msg.errorCode,
      error_message: msg.errorMessage,
    })
    .eq("id", row.id);

  if (updateError) console.error("QUEUE_STATUS_UPDATE_ERROR", updateError);
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
    await logMessage(msg);

    if (msg.direction === "inbound") {
      await handleInbound(msg);
    } else {
      await handleStatusCallback(msg);
    }
  } catch (err) {
    // Persisting already happened or already failed and logged. Returning 500
    // here would make Sendblue retry the whole payload, so the error is
    // swallowed after logging.
    console.error("SENDBLUE_WEBHOOK_ERROR", err);
  }

  return Response.json({ ok: true });
}
