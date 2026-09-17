// lib/marketing/sms-keywords.ts
//
// Carrier rules require STOP to work, always, whatever else is in the message.
// Getting this wrong is the fastest way to lose a number, so the matching here
// is deliberately generous: punctuation, casing, and surrounding whitespace are
// all ignored.

export type InboundIntent = "opt_out" | "opt_in" | "help" | "other";

// The keywords carriers mandate, plus the common variants people actually
// type. "end" and "quit" are in the CTIA list even though they read oddly.
const OPT_OUT_KEYWORDS = [
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "opt out",
  "optout",
  "revoke",
  "end",
  "quit",
];

const OPT_IN_KEYWORDS = ["start", "unstop", "yes"];

const HELP_KEYWORDS = ["help", "info"];

// Strips punctuation and collapses whitespace so "STOP!" and " stop. " both
// match. Keeps inner spaces so "opt out" survives as two words.
export function normalizeInbound(content: string | null | undefined): string {
  if (!content) return "";
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Only an exact match on the whole message counts. A reply of "stop by on
// Saturday?" is a question from a customer, not an opt-out, and treating it as
// one would silently drop a real conversation.
export function classifyInbound(content: string | null | undefined): InboundIntent {
  const normalized = normalizeInbound(content);
  if (!normalized) return "other";
  if (OPT_OUT_KEYWORDS.includes(normalized)) return "opt_out";
  if (OPT_IN_KEYWORDS.includes(normalized)) return "opt_in";
  if (HELP_KEYWORDS.includes(normalized)) return "help";
  return "other";
}

export function isOptOut(content: string | null | undefined): boolean {
  return classifyInbound(content) === "opt_out";
}

export function isOptIn(content: string | null | undefined): boolean {
  return classifyInbound(content) === "opt_in";
}
