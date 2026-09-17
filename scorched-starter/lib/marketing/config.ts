// lib/marketing/config.ts — server only
//
// Every tunable number for the marketing system, read from env with the
// documented default as a fallback. None of the Sendblue limits are hardcoded
// at a call site: the real numbers depend on what Sam negotiates on the Blue
// Ocean plan, and the advertised figures are the starting point, not the
// contract.

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

export type SmsLimits = {
  newContactsPerDay: number;
  newContactsPerHour: number;
  burstPerSecond: number;
  queueCap: number;
  maxConsecutiveNoReply: number;
  quietHoursStart: number;
  quietHoursEnd: number;
};

export function smsLimits(): SmsLimits {
  return {
    newContactsPerDay: intFromEnv("SMS_NEW_CONTACTS_PER_DAY", 50),
    newContactsPerHour: intFromEnv("SMS_NEW_CONTACTS_PER_HOUR", 15),
    burstPerSecond: intFromEnv("SMS_BURST_PER_SECOND", 10),
    queueCap: intFromEnv("SMS_QUEUE_CAP", 1500),
    // Sendblue enforces this one itself and says it cannot be disabled, so
    // exceeding it means the line simply stops delivering. The worker tracks
    // it to fail loudly rather than silently dropping messages.
    maxConsecutiveNoReply: intFromEnv("SMS_MAX_CONSECUTIVE_NO_REPLY", 150),
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

export function sendblueBaseUrl(): string {
  return (process.env.SENDBLUE_BASE_URL || "https://api.sendblue.com").replace(/\/+$/, "");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com").replace(/\/+$/, "");
}

export function marketingFrom(): string {
  return process.env.RESEND_MARKETING_FROM || "Scorched Studio <hello@news.scorchedstudio.com>";
}
