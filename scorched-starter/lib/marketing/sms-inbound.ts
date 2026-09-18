// lib/marketing/sms-inbound.ts — server only
//
// Everything both provider webhooks do with a message once it has been parsed
// into the shared InboundMessage shape: log it, act on opt-out and opt-in
// keywords, forward real questions to a human, and move queue rows along as
// delivery statuses arrive.
//
// Provider-specific parts stay in the provider: the status vocabulary is the
// provider's own, so the status mapper is passed in rather than assumed.
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueStatus, SubscriberRecord } from "@/lib/supabase";
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
export async function forwardToHuman(msg: InboundMessage): Promise<void> {
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

// Wiring only. The rules live in sms-inbound-core.ts, which takes these as
// injected dependencies so they can be tested without a database.
import {
  applyStatusUpdate,
  decideInbound,
  type InboundDeps,
  type InboundOutcome,
  type StatusDeps,
} from "./sms-inbound-core";

export type { InboundOutcome };

const inboundDeps: InboundDeps = {
  findSubscriberIdByPhone: async (phone) => (await findSubscriberByPhone(phone))?.id ?? null,

  setSmsStatus: async (subscriberId, status, consentText) => {
    const sb = getSupabase();

    const { error } = await sb
      .from("subscribers")
      .update({ sms_status: status, last_sms_contact_at: new Date().toISOString() })
      .eq("id", subscriberId);
    if (error) {
      console.error("SMS_STATUS_UPDATE_ERROR", error);
      return;
    }

    const { error: logError } = await sb.from("consent_events").insert({
      subscriber_id: subscriberId,
      channel: "sms",
      action: status === "subscribed" ? "opt_in" : "opt_out",
      source: "inbound_keyword",
      consent_text: consentText,
    });
    if (logError) console.error("CONSENT_LOG_ERROR", logError);
  },

  touchLastContact: async (subscriberId) => {
    const { error } = await getSupabase()
      .from("subscribers")
      .update({ last_sms_contact_at: new Date().toISOString() })
      .eq("id", subscriberId);
    if (error) console.error("LAST_CONTACT_UPDATE_ERROR", error);
  },

  forwardToHuman,
};

const statusDeps: StatusDeps = {
  findQueueRowByHandle: async (handle) => {
    const { data, error } = await getSupabase()
      .from("sms_queue")
      .select("id,status")
      .eq("provider_message_handle", handle)
      .maybeSingle();
    if (error) {
      console.error("QUEUE_LOOKUP_ERROR", error);
      return null;
    }
    return (data as QueueRow | null) ?? null;
  },

  updateQueueRow: async (id, status, errorCode, errorMessage) => {
    const { error } = await getSupabase()
      .from("sms_queue")
      .update({ status, error_code: errorCode, error_message: errorMessage })
      .eq("id", id);
    if (error) console.error("QUEUE_STATUS_UPDATE_ERROR", error);
  },
};

type QueueRow = { id: string; status: SmsQueueStatus };

export function handleInboundSms(msg: InboundMessage): Promise<InboundOutcome> {
  return decideInbound(msg, inboundDeps);
}

export function handleSmsStatusUpdate(
  msg: InboundMessage,
  mapStatus: SmsQueueStatusMapper
): Promise<"updated" | "ignored"> {
  return applyStatusUpdate(msg, mapStatus, statusDeps);
}
