// lib/marketing/sms-inbound.ts — server only
//
// Everything both provider webhooks do with a message once it has been parsed
// into the shared InboundMessage shape: log it, act on opt-out and opt-in
// keywords, forward real questions to a human, and move queue rows along as
// delivery statuses arrive.
//
// Extracted from the Sendblue route so the Telnyx route runs the identical
// logic rather than a copy that can drift. Provider-specific parts stay in the
// provider: the status vocabulary differs, so the status mapper is passed in.
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueRecord, SubscriberRecord } from "@/lib/supabase";
import { classifyInbound } from "./sms-keywords";
import { shouldAdvanceStatus } from "./sms-status";
import { SMS_START_CONSENT_TEXT, SMS_STOP_CONSENT_TEXT } from "./consent-copy";
import { marketingIsLive, logSuppressedSend } from "./config";
import type { InboundMessage, SmsQueueStatusMapper } from "./sms-provider";

const FORWARD_TO = "contact@scorchedstudio.com";

export async function logSmsMessage(msg: InboundMessage): Promise<void> {
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

  // Upsert rather than insert: both providers retry, and a duplicate delivery
  // must not create a second log row.
  const { error } = msg.messageHandle
    ? await sb.from("sms_messages").upsert(row, { onConflict: "provider_message_handle" })
    : await sb.from("sms_messages").insert(row);

  if (error) console.error("SMS_MESSAGE_LOG_ERROR", error);
}

export async function findSubscriberByPhone(phone: string): Promise<SubscriberRecord | null> {
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

export async function setSmsStatus(
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
        ${msg.mediaUrl ? `<p><a href="${msg.mediaUrl}">Attached media</a></p>` : ""}
      </div>`,
    });
  } catch (err) {
    console.error("SMS_FORWARD_ERROR", err);
  }
}

export type InboundOutcome = "opt_out" | "opt_in" | "help" | "forwarded" | "ignored";

export async function handleInboundSms(msg: InboundMessage): Promise<InboundOutcome> {
  if (!msg.fromNumber) return "ignored";

  const subscriber = await findSubscriberByPhone(msg.fromNumber);
  const intent = classifyInbound(msg.content);

  // The provider's own opt-out flag wins even when the text does not look like
  // a keyword to us. On Telnyx that flag comes from autoresponse_type, and it
  // is what actually blocks delivery, so our record has to follow it rather
  // than argue with it. Their keyword list is not identical to ours.
  if (intent === "opt_out" || msg.optedOut) {
    if (subscriber) await setSmsStatus(subscriber, "unsubscribed", SMS_STOP_CONSENT_TEXT);
    return "opt_out";
  }

  if (intent === "opt_in") {
    if (subscriber) await setSmsStatus(subscriber, "subscribed", SMS_START_CONSENT_TEXT);
    return "opt_in";
  }

  // Any other inbound message still counts as contact. Nothing on the Telnyx
  // path budgets against this, but the column stays meaningful and the
  // Sendblue path needs it if it is ever revived.
  if (subscriber) {
    const { error } = await getSupabase()
      .from("subscribers")
      .update({ last_sms_contact_at: new Date().toISOString() })
      .eq("id", subscriber.id);
    if (error) console.error("LAST_CONTACT_UPDATE_ERROR", error);
  }

  // Both providers answer HELP with their own auto-reply, so it needs no
  // human. A real question does.
  if (intent === "other") {
    await forwardToHuman(msg);
    return "forwarded";
  }
  return "help";
}

// Moves a queue row along as delivery statuses arrive. The status vocabulary is
// provider-specific, so the mapper is injected.
export async function handleSmsStatusUpdate(
  msg: InboundMessage,
  mapStatus: SmsQueueStatusMapper
): Promise<"updated" | "ignored"> {
  if (!msg.messageHandle) return "ignored";

  const mapped = mapStatus(msg.status);
  if (!mapped) return "ignored";

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sms_queue")
    .select("*")
    .eq("provider_message_handle", msg.messageHandle)
    .maybeSingle();

  if (error) {
    console.error("QUEUE_LOOKUP_ERROR", error);
    return "ignored";
  }
  const row = data as SmsQueueRecord | null;
  if (!row) return "ignored";

  // Callbacks arrive out of order; a late 'queued' must not undo a delivery.
  if (!shouldAdvanceStatus(row.status, mapped)) return "ignored";

  const { error: updateError } = await sb
    .from("sms_queue")
    .update({
      status: mapped,
      error_code: msg.errorCode,
      error_message: msg.errorMessage,
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("QUEUE_STATUS_UPDATE_ERROR", updateError);
    return "ignored";
  }
  return "updated";
}
