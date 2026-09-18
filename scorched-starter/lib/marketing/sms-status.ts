// lib/marketing/sms-status.ts
//
// Maps Telnyx message statuses onto our queue statuses, plus the retry and
// ordering rules that decide what a delivery callback is allowed to change.
import type { SmsQueueStatus } from "../supabase.ts";

// Whether a status callback should overwrite what the row already says.
// Callbacks can arrive out of order, and a late QUEUED must not undo a
// DELIVERED that already landed.
const RANK: Record<SmsQueueStatus, number> = {
  pending: 0,
  sending: 1,
  sent: 2,
  // A confirmed failure outranks 'sent'. Telnyx reports sent when it hands the
  // message off and delivery_failed when the carrier later rejects it, and the
  // later fact is the true one. Equal rank let a pair of out-of-order callbacks
  // flip the row back and forth indefinitely.
  failed: 3,
  delivered: 4,
  skipped: 5,
};

export function shouldAdvanceStatus(current: SmsQueueStatus, incoming: SmsQueueStatus): boolean {
  if (current === incoming) return false;
  if (current === "delivered") return false; // nothing supersedes a delivery
  if (current === "skipped") return false; // deliberately removed from the send
  return RANK[incoming] >= RANK[current];
}

// Provider error codes worth retrying: transient rate limiting and internal
// faults. Everything else (validation, blocked recipient) fails again
// identically, so retrying only delays the inevitable.
const RETRYABLE_CODES = new Set(["4001", "5000", "5509"]);

export function isRetryableError(errorCode: string | null | undefined, httpStatus?: number): boolean {
  if (httpStatus !== undefined && (httpStatus === 429 || httpStatus >= 500)) return true;
  if (!errorCode) return false;
  return RETRYABLE_CODES.has(String(errorCode).trim());
}

// Exponential backoff with a ceiling, so a run of failures spreads out instead
// of hammering the provider every five minutes.
export function backoffMs(attempts: number): number {
  const base = 5 * 60 * 1000; // one cron interval
  return Math.min(base * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

export const MAX_ATTEMPTS = 5;


// Telnyx reports status per recipient, nested at data.payload.to[0].status,
// rather than as a top-level field.

export const TELNYX_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "sending_failed",
  "delivery_failed",
  "delivery_unconfirmed",
  "webhook_delivered",
] as const;

export type TelnyxStatus = (typeof TELNYX_STATUSES)[number];

const TELNYX_MAP: Record<TelnyxStatus, SmsQueueStatus> = {
  queued: "sending",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  sending_failed: "failed",
  delivery_failed: "failed",
  // The carrier never confirmed either way. Treated as 'sent' rather than
  // 'failed' because the message did leave Telnyx: calling it a failure would
  // under-report delivery and, worse, invite a resend to someone who already
  // got it.
  delivery_unconfirmed: "sent",
  // Only ever appears on inbound messages, describing our own webhook.
  webhook_delivered: "sending",
};

export function mapTelnyxStatus(status: string | null | undefined): SmsQueueStatus | null {
  if (!status) return null;
  const key = status.trim().toLowerCase() as TelnyxStatus;
  return TELNYX_MAP[key] ?? null;
}

// Telnyx error code for a recipient who has texted STOP. Opt-out is enforced at
// the messaging profile level, so once someone stops on any number in the
// profile, every number in it is blocked from reaching them.
export const TELNYX_OPTED_OUT_CODE = "40300";

export function isTelnyxOptedOutError(errorCode: string | null | undefined): boolean {
  return String(errorCode ?? "").trim() === TELNYX_OPTED_OUT_CODE;
}
