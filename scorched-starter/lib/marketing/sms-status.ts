// lib/marketing/sms-status.ts
//
// Maps Sendblue's message statuses onto our queue statuses.
//
// Sendblue reports eight, not the five the original spec listed. The extra
// ones (REGISTERED, PENDING, ACCEPTED) are all in-flight states, so they map
// to 'sending' rather than being ignored, which would leave a row stuck.
import type { SmsQueueStatus } from "../supabase.ts";

export const SENDBLUE_STATUSES = [
  "REGISTERED",
  "PENDING",
  "QUEUED",
  "ACCEPTED",
  "SENT",
  "DELIVERED",
  "DECLINED",
  "ERROR",
] as const;

export type SendblueStatus = (typeof SENDBLUE_STATUSES)[number];

const MAP: Record<SendblueStatus, SmsQueueStatus> = {
  // In flight. Nothing to do but wait for the next callback.
  REGISTERED: "sending",
  PENDING: "sending",
  QUEUED: "sending",
  ACCEPTED: "sending",
  // Terminal success for SMS and for iMessage users who are offline.
  SENT: "sent",
  // Terminal success for iMessage and RCS.
  DELIVERED: "delivered",
  // Terminal failures. DECLINED means the recipient's device or carrier
  // refused it, which is not retryable.
  DECLINED: "failed",
  ERROR: "failed",
};

export function mapSendblueStatus(status: string | null | undefined): SmsQueueStatus | null {
  if (!status) return null;
  const key = status.trim().toUpperCase() as SendblueStatus;
  return MAP[key] ?? null;
}

// Whether a status callback should overwrite what the row already says.
// Callbacks can arrive out of order, and a late QUEUED must not undo a
// DELIVERED that already landed.
const RANK: Record<SmsQueueStatus, number> = {
  pending: 0,
  sending: 1,
  sent: 2,
  // A confirmed failure outranks 'sent'. Sendblue can report SENT and then
  // ERROR when a carrier rejects downstream, and the later fact is the true
  // one. Giving them equal rank let a pair of out-of-order callbacks flip the
  // row back and forth indefinitely.
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

// Sendblue error codes worth retrying. 4001 and 5509 are rate limiting, 5000
// is an internal error on their side. Everything else (validation, blacklist)
// will fail again identically, so retrying just burns the budget.
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


// ── Telnyx ───────────────────────────────────────────────────────────────────
//
// Telnyx reports status per recipient, nested at data.payload.to[0].status,
// rather than as a top-level field the way Sendblue does.

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
