// lib/marketing/sms-inbound-core.ts
//
// What to do with an inbound message or a delivery status, with every database
// operation injected. No "@/" imports, so the project's test runner can drive
// it: these are the rules that decide whether someone stays on the list, and
// they are worth testing rather than only reading.
//
// sms-inbound.ts wires these to Supabase and Resend.
import type { SmsQueueStatus } from "../supabase.ts";
import { classifyInbound } from "./sms-keywords.ts";
import { shouldAdvanceStatus } from "./sms-status.ts";
import { SMS_START_CONSENT_TEXT, SMS_STOP_CONSENT_TEXT } from "./consent-copy.ts";
import type { InboundMessage, SmsQueueStatusMapper } from "./sms-provider.ts";

export type InboundOutcome = "opt_out" | "opt_in" | "help" | "forwarded" | "ignored";

export type InboundDeps = {
  findSubscriberIdByPhone: (phone: string) => Promise<string | null>;
  setSmsStatus: (
    subscriberId: string,
    status: "subscribed" | "unsubscribed",
    consentText: string
  ) => Promise<void>;
  touchLastContact: (subscriberId: string) => Promise<void>;
  forwardToHuman: (msg: InboundMessage) => Promise<void>;
};

export async function decideInbound(
  msg: InboundMessage,
  deps: InboundDeps
): Promise<InboundOutcome> {
  if (!msg.fromNumber) return "ignored";

  const subscriberId = await deps.findSubscriberIdByPhone(msg.fromNumber);
  const intent = classifyInbound(msg.content);

  // The provider's own opt-out flag wins even when the text does not look like
  // a keyword to us. On Telnyx it comes from autoresponse_type, and it is what
  // actually blocks delivery, so our record follows it rather than arguing.
  // Their keyword list is close to but not identical to ours.
  if (intent === "opt_out" || msg.optedOut) {
    if (subscriberId) await deps.setSmsStatus(subscriberId, "unsubscribed", SMS_STOP_CONSENT_TEXT);
    return "opt_out";
  }

  if (intent === "opt_in") {
    if (subscriberId) await deps.setSmsStatus(subscriberId, "subscribed", SMS_START_CONSENT_TEXT);
    return "opt_in";
  }

  // Any other inbound message still counts as contact. Nothing on the Telnyx
  // path paces against this, but the column stays meaningful and the Sendblue
  // path needs it.
  if (subscriberId) await deps.touchLastContact(subscriberId);

  // Both providers answer HELP with their own auto-reply, so it needs no
  // human. A real question does.
  if (intent === "other") {
    await deps.forwardToHuman(msg);
    return "forwarded";
  }
  return "help";
}

export type QueueRowRef = { id: string; status: SmsQueueStatus };

export type StatusDeps = {
  findQueueRowByHandle: (handle: string) => Promise<QueueRowRef | null>;
  updateQueueRow: (
    id: string,
    status: SmsQueueStatus,
    errorCode: string | null,
    errorMessage: string | null
  ) => Promise<void>;
};

export async function applyStatusUpdate(
  msg: InboundMessage,
  mapStatus: SmsQueueStatusMapper,
  deps: StatusDeps
): Promise<"updated" | "ignored"> {
  if (!msg.messageHandle) return "ignored";

  const mapped = mapStatus(msg.status);
  if (!mapped) return "ignored";

  const row = await deps.findQueueRowByHandle(msg.messageHandle);
  if (!row) return "ignored";

  // Callbacks arrive out of order; a late 'queued' must not undo a delivery.
  if (!shouldAdvanceStatus(row.status, mapped)) return "ignored";

  await deps.updateQueueRow(row.id, mapped, msg.errorCode, msg.errorMessage);
  return "updated";
}
