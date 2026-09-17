// lib/marketing/sms-provider.ts
//
// The seam between the worker and whoever actually delivers the texts.
// Sendblue is the only implementation today, but its Blue Ocean rate limits
// (50 new contacts a day, and a hard 150-consecutive-outbound-without-reply
// ceiling) may turn out to be too tight for a list of this size. Keeping the
// worker behind this interface means swapping providers is one file, not a
// rewrite.

export type SendArgs = {
  to: string; // E.164
  body: string;
  mediaUrl?: string | null;
  // Where the provider should post delivery status updates.
  statusCallback?: string | null;
};

export type SendResult = {
  ok: boolean;
  // The provider's own identifier, stored on the queue row so a later status
  // callback can find it again.
  messageHandle: string | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus?: number;
  // True when MARKETING_LIVE was off and nothing actually left the building.
  suppressed?: boolean;
};

export type InboundMessage = {
  messageHandle: string | null;
  direction: "inbound" | "outbound";
  fromNumber: string | null;
  toNumber: string | null;
  content: string | null;
  mediaUrl: string | null;
  service: "iMessage" | "SMS" | "RCS" | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  // The provider's own opt-out flag, which is authoritative even when the
  // message text does not look like a keyword.
  optedOut: boolean;
  occurredAt: string | null;
  raw: unknown;
};

export interface SmsProvider {
  readonly name: string;
  send(args: SendArgs): Promise<SendResult>;
  // Tells the provider to stop delivering to a number, so its own suppression
  // list agrees with ours.
  optOut(phone: string): Promise<{ ok: boolean; suppressed?: boolean }>;
  parseInboundWebhook(payload: unknown): InboundMessage;
}
