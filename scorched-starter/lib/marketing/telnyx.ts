// lib/marketing/telnyx.ts — server only
//
// The Telnyx implementation of SmsProvider, and the active one.
//
// Chosen over a conversational-messaging provider, whose plan capped outbound
// at 50 new contacts a day and stopped a line after 150 consecutive messages
// without a reply. Those are sensible guards for two-way conversation and
// unworkable for the one-way broadcast this system does. A registered 10DLC
// long code has neither limit.
//
// Uses plain fetch, not the `telnyx` SDK. The SDK is current and typed, but the
// send path is one POST, and its webhook helper reads TELNYX_PUBLIC_KEY from
// the environment itself and documents no timestamp tolerance, which is the
// half that stops a captured webhook being replayed. Both are done here and in
// telnyx-webhook.ts instead, so the whole rule is visible and unit testable.
// The dependency was therefore removed rather than left installed and unused.
import {
  logSuppressedSend,
  marketingIsLive,
  telnyxConfig,
} from "./config.ts";
import { isTelnyxOptedOutError } from "./sms-status.ts";
import type {
  InboundMessage,
  SendArgs,
  SendResult,
  SmsProvider,
} from "./sms-provider.ts";

const TELNYX_API = "https://api.telnyx.com/v2";

type Json = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

// Telnyx returns errors as an array of objects carrying code, title and detail.
// The first one is what the send path reports.
function firstError(payload: Json): { code: string | null; message: string | null } {
  const errors = payload.errors;
  if (!Array.isArray(errors) || errors.length === 0) return { code: null, message: null };
  const first = asRecord(errors[0]);
  const code = first.code === undefined || first.code === null ? null : String(first.code);
  const message = str(first.detail) ?? str(first.title);
  return { code, message };
}

export class TelnyxProvider implements SmsProvider {
  readonly name = "telnyx";

  async send(args: SendArgs): Promise<SendResult> {
    const config = telnyxConfig();

    const body: Json = {
      from: config.fromNumber,
      to: args.to,
      text: args.body,
      messaging_profile_id: config.messagingProfileId,
      type: args.mediaUrl ? "MMS" : "SMS",
    };
    if (args.mediaUrl) body.media_urls = [args.mediaUrl];
    // Per-message callback rather than relying on the profile's webhook, so a
    // profile misconfiguration cannot silently strand every queue row in
    // 'sent' with no delivery confirmation.
    if (args.statusCallback) {
      body.webhook_url = args.statusCallback;
      body.use_profile_webhooks = false;
    }

    // The gate. Nothing reaches a real phone unless MARKETING_LIVE is exactly
    // "true". The suppressed result is flagged so the worker can tell it from a
    // real send: treating it as real would stamp last_sms_contact_at and record
    // a conversation that never happened.
    if (!marketingIsLive()) {
      logSuppressedSend("sms", {
        provider: "telnyx",
        to: args.to,
        body: args.body,
        mediaUrl: args.mediaUrl ?? null,
      });
      // The prefix only makes a dry-run row obvious when reading sms_queue by
      // hand. Nothing branches on it; the worker is told through `suppressed`.
      return {
        ok: true,
        messageHandle: `suppressed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        status: "queued",
        errorCode: null,
        errorMessage: null,
        suppressed: true,
      };
    }

    if (!config.apiKey) throw new Error("Missing TELNYX_API_KEY");
    if (!config.fromNumber) throw new Error("Missing TELNYX_FROM_NUMBER");

    let res: Response;
    try {
      res = await fetch(`${TELNYX_API}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A network failure is retryable, so it is reported as a 5xx rather than
      // a permanent error.
      return {
        ok: false,
        messageHandle: null,
        status: null,
        errorCode: null,
        errorMessage: err instanceof Error ? err.message : "network error",
        httpStatus: 503,
      };
    }

    const json = asRecord(await res.json().catch(() => ({})));

    if (!res.ok) {
      const { code, message } = firstError(json);
      // 40300 means this person texted STOP. That is not a failure to retry,
      // it is our record being out of date, so it is surfaced as its own
      // outcome for the worker to act on.
      return {
        ok: false,
        messageHandle: null,
        status: null,
        errorCode: code,
        errorMessage: message,
        httpStatus: res.status,
        optedOut: isTelnyxOptedOutError(code),
      };
    }

    const data = asRecord(json.data);
    const recipients = Array.isArray(data.to) ? data.to : [];
    const firstRecipient = asRecord(recipients[0]);

    return {
      ok: true,
      messageHandle: str(data.id),
      // Per-recipient status, since Telnyx reports it inside the `to` array
      // rather than at the top level.
      status: str(firstRecipient.status) ?? "queued",
      errorCode: null,
      errorMessage: null,
      httpStatus: res.status,
    };
  }

  // Telnyx maintains its own opt-out list at the messaging profile level and
  // populates it from inbound STOP keywords automatically, so there is nothing
  // to push. Supabase remains the source of truth on our side; this exists so
  // the interface stays honest for any future provider that does need it.
  async optOut(phone: string): Promise<{ ok: boolean; suppressed?: boolean }> {
    if (!marketingIsLive()) {
      logSuppressedSend("sms-opt-out", { provider: "telnyx", phone });
      return { ok: true, suppressed: true };
    }
    console.info("TELNYX_OPT_OUT_NOOP", {
      phone,
      note: "Telnyx blocks opted-out numbers at the messaging profile level; nothing to push",
    });
    return { ok: true };
  }

  parseInboundWebhook(payload: unknown): InboundMessage {
    return parseTelnyxPayload(payload);
  }
}

// Exported separately so the webhook tests can exercise parsing without
// constructing a provider or touching env.
//
// Telnyx wraps everything in { data: { event_type, payload } }, and the parts
// that matter are nested: the sender is payload.from.phone_number, and the
// status is payload.to[0].status.
export function parseTelnyxPayload(raw: unknown): InboundMessage & { eventType: string | null } {
  const envelope = asRecord(raw);
  const data = asRecord(envelope.data);
  const payload = asRecord(data.payload);

  const eventType = str(data.event_type);
  const direction = payload.direction === "outbound" ? "outbound" : "inbound";

  const from = asRecord(payload.from);
  const recipients = Array.isArray(payload.to) ? payload.to : [];
  const firstRecipient = asRecord(recipients[0]);

  const { code, message } = firstError(payload);

  // Telnyx carries media as an array of objects, while our log stores a single
  // URL. The first one is kept, which is all an MMS marketing reply ever has.
  const media = Array.isArray(payload.media) ? payload.media : [];
  const mediaUrl = media.length > 0 ? str(asRecord(media[0]).url) : null;

  // autoresponse_type is Telnyx telling us it recognised a keyword and already
  // acted on it. Authoritative even when our own matching disagrees, which is
  // the point: their opt-out list is what actually blocks delivery.
  const autoresponse = str(payload.autoresponse_type);

  return {
    messageHandle: str(payload.id),
    direction,
    fromNumber: str(from.phone_number),
    toNumber: str(firstRecipient.phone_number),
    content: str(payload.text),
    mediaUrl,
    // Telnyx sends SMS and MMS; there is no iMessage or RCS on this path.
    service: "SMS",
    status: str(firstRecipient.status) ?? str(payload.status),
    errorCode: code,
    errorMessage: message,
    optedOut: autoresponse === "stop",
    occurredAt: str(payload.received_at) ?? str(payload.completed_at) ?? str(payload.sent_at),
    raw,
    eventType,
  };
}

// Which Telnyx event types the webhook route acts on.
export const TELNYX_INBOUND_EVENT = "message.received";
export const TELNYX_STATUS_EVENTS = ["message.sent", "message.finalized"];

export const telnyx = new TelnyxProvider();
