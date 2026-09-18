// lib/marketing/config.ts — server only
//
// Every tunable number for the marketing system, read from env with a
// documented default as a fallback. Nothing is hardcoded at a call site: the
// usable send rate depends on the throughput carriers assign to the 10DLC
// campaign, which is not known until it is approved.

import { normalizePhone } from "./phone.ts";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  // A typo in an env var must not silently become 0 messages per day or, worse,
  // NaN comparisons that let everything through.
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`MARKETING_CONFIG_BAD_VALUE ${name}=${JSON.stringify(raw)}, using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export function telnyxConfig() {
  return {
    apiKey: process.env.TELNYX_API_KEY ?? "",
    publicKey: process.env.TELNYX_PUBLIC_KEY ?? "",
    messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID ?? "",
    fromNumber: process.env.TELNYX_FROM_NUMBER ?? "",
  };
}

// Cost per SMS segment per recipient, used only for the estimate shown in the
// composer. Telnyx's US 10DLC outbound rate is a fraction of a cent and varies
// by carrier surcharge, so this is a planning figure, not a bill.
export function smsCostPerSegment(): number {
  const raw = process.env.SMS_COST_PER_SEGMENT;
  if (!raw) return 0.004;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.004;
}

export type SmsLimits = {
  maxPerMinute: number;
  quietHoursStart: number;
  quietHoursEnd: number;
};

export function smsLimits(): SmsLimits {
  return {
    // Throughput cap. Deliberately conservative: a registered 10DLC campaign
    // has a carrier-assigned throughput that starts low, and exceeding it gets
    // messages filtered rather than queued.
    maxPerMinute: intFromEnv("SMS_MAX_PER_MINUTE", 12),
    quietHoursStart: intFromEnv("SMS_QUIET_HOURS_START", 20),
    quietHoursEnd: intFromEnv("SMS_QUIET_HOURS_END", 9),
  };
}

// The master send gate.
//
// Anything other than exactly "true" keeps providers in log-only mode. This is
// deliberately strict: a stray "TRUE" or "1" in a preview environment must not
// be what starts texting the customer list.
export function marketingIsLive(): boolean {
  return process.env.MARKETING_LIVE === "true";
}

// Addresses and numbers that may receive a test even while MARKETING_LIVE is
// off, so a campaign can be proofread in a real inbox before anyone flips the
// switch. Without this the gate is circular: you cannot see what a send looks
// like until you have already made every send possible.
//
// This is deliberately an allowlist rather than a "test mode" flag. A flag
// would mean one mistake sends the whole list; an allowlist can only ever
// reach the handful of addresses written in the environment.
export function testRecipients(): string[] {
  return (process.env.MARKETING_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Emails compare case-insensitively. Phone numbers go through the same E.164
// normalisation everything else uses, so "(801) 555-0123" in the environment
// matches "+18015550123" from the form. Comparing raw digits does not work:
// those two differ by the country code alone.
export function isTestRecipient(target: string): boolean {
  const wanted = target.trim().toLowerCase();
  if (!wanted) return false;

  const wantedPhone = normalizePhone(wanted);

  return testRecipients().some((allowed) => {
    if (allowed.toLowerCase() === wanted) return true;
    if (!wantedPhone) return false;
    return normalizePhone(allowed) === wantedPhone;
  });
}

// Whether a single test send may actually go out: either the system is live, or
// this specific recipient is on the allowlist. Campaign sends never call this.
export function mayTestSendTo(target: string): boolean {
  return marketingIsLive() || isTestRecipient(target);
}

// Shouted once per suppressed send so a dev environment makes it obvious that
// nothing actually went out, and what would have.
export function logSuppressedSend(kind: string, detail: Record<string, unknown>): void {
  console.info(`MARKETING_SUPPRESSED[${kind}] MARKETING_LIVE is not true, nothing was sent`, detail);
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com").replace(/\/+$/, "");
}

export function marketingFrom(): string {
  return process.env.RESEND_MARKETING_FROM || "Scorched Studio <hello@news.scorchedstudio.com>";
}
