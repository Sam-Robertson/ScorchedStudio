// lib/marketing/config.ts — server only
//
// Every tunable number for the marketing system, read from env with a
// documented default as a fallback. Nothing is hardcoded at a call site: the
// usable send rate depends on the throughput carriers assign to the 10DLC
// campaign, which is not known until it is approved.

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
