// lib/marketing/sendblue.ts — server only
//
// The Sendblue implementation of SmsProvider.
//
// Sendblue blocks browser requests outright, so every call here must run on
// the server. Nothing in this file may be imported into a client component.
//
// Using plain fetch rather than the `sendblue` npm SDK: the API surface we
// need is three endpoints, and fetch keeps the request shape visible next to
// the docs it was written from.
import { marketingIsLive, logSuppressedSend, sendblueBaseUrl } from "./config.ts";
import type {
  InboundMessage,
  SendArgs,
  SendResult,
  SmsProvider,
} from "./sms-provider.ts";

type SendbluePayload = Record<string, unknown>;

function credentials(): { keyId: string; secret: string } {
  const keyId = process.env.SENDBLUE_API_KEY_ID;
  const secret = process.env.SENDBLUE_API_SECRET_KEY;
  if (!keyId || !secret) {
    throw new Error("Missing SENDBLUE_API_KEY_ID or SENDBLUE_API_SECRET_KEY");
  }
  return { keyId, secret };
}

export function sendblueHeaders(): Record<string, string> {
  const { keyId, secret } = credentials();
  return {
    "sb-api-key-id": keyId,
    "sb-api-secret-key": secret,
    "content-type": "application/json",
  };
}

function fromNumber(): string {
  const from = process.env.SENDBLUE_FROM_NUMBER;
  // Required on every send, and a send without it fails at the provider with a
  // less obvious error than this one.
  if (!from) throw new Error("Missing SENDBLUE_FROM_NUMBER");
  return from;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Sendblue reports the transport it actually used. Anything unrecognised is
// stored as null rather than guessed, since the column has a CHECK.
function serviceOf(value: unknown): "iMessage" | "SMS" | "RCS" | null {
  const s = str(value);
  if (!s) return null;
  const normalized = s.toLowerCase();
  if (normalized === "imessage") return "iMessage";
  if (normalized === "sms") return "SMS";
  if (normalized === "rcs") return "RCS";
  return null;
}

export class SendblueProvider implements SmsProvider {
  readonly name = "sendblue";

  async send(args: SendArgs): Promise<SendResult> {
    const body: SendbluePayload = {
      number: args.to,
      from_number: fromNumber(),
      content: args.body,
    };
    if (args.mediaUrl) body.media_url = args.mediaUrl;
    if (args.statusCallback) body.status_callback = args.statusCallback;

    // The gate. Nothing reaches a real phone unless MARKETING_LIVE is exactly
    // "true", and the suppressed path returns a handle shaped like a real one
    // so the rest of the pipeline can be exercised end to end without sending.
    if (!marketingIsLive()) {
      logSuppressedSend("sms", { to: args.to, body: args.body, mediaUrl: args.mediaUrl ?? null });
      return {
        ok: true,
        messageHandle: `suppressed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        status: "QUEUED",
        errorCode: null,
        errorMessage: null,
        suppressed: true,
      };
    }

    let res: Response;
    try {
      res = await fetch(`${sendblueBaseUrl()}/api/send-message`, {
        method: "POST",
        headers: sendblueHeaders(),
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

    const json = (await res.json().catch(() => ({}))) as SendbluePayload;

    return {
      ok: res.ok,
      messageHandle: str(json.message_handle),
      status: str(json.status),
      errorCode: json.error_code === undefined || json.error_code === null ? null : String(json.error_code),
      errorMessage: str(json.error_message) ?? str(json.message),
      httpStatus: res.status,
    };
  }

  async optOut(phone: string): Promise<{ ok: boolean; suppressed?: boolean }> {
    if (!marketingIsLive()) {
      logSuppressedSend("sms-opt-out", { phone });
      return { ok: true, suppressed: true };
    }

    try {
      const res = await fetch(`${sendblueBaseUrl()}/api/v2/contacts/opt-out`, {
        method: "POST",
        headers: sendblueHeaders(),
        body: JSON.stringify({ number: phone, opted_out: true }),
      });
      if (!res.ok) console.error("SENDBLUE_OPT_OUT_FAILED", { phone, status: res.status });
      return { ok: res.ok };
    } catch (err) {
      console.error("SENDBLUE_OPT_OUT_ERROR", { phone, err });
      return { ok: false };
    }
  }

  parseInboundWebhook(payload: unknown): InboundMessage {
    return parseSendbluePayload(payload);
  }
}

// Exported separately so the webhook tests can exercise parsing without
// constructing a provider or touching env.
export function parseSendbluePayload(payload: unknown): InboundMessage {
  const p = (payload ?? {}) as SendbluePayload;

  return {
    messageHandle: str(p.message_handle),
    direction: p.is_outbound === true ? "outbound" : "inbound",
    fromNumber: str(p.from_number),
    toNumber: str(p.to_number),
    content: str(p.content),
    mediaUrl: str(p.media_url),
    service: serviceOf(p.service),
    status: str(p.status),
    errorCode:
      p.error_code === undefined || p.error_code === null ? null : String(p.error_code),
    errorMessage: str(p.error_message) ?? str(p.error_reason),
    optedOut: p.opted_out === true,
    occurredAt: str(p.date_sent),
    raw: payload,
  };
}

export const sendblue = new SendblueProvider();
