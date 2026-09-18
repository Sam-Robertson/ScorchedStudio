// lib/marketing/resend-event.ts
//
// Turns what svix's Webhook.verify() hands back into the event object.
//
// This exists because of a real bug. verify() throws when a signature is bad
// and, in this version, returns undefined when it is good: it authenticates
// the payload, it does not parse it. The route treated the return value as the
// event, so every genuine webhook crashed on `event.type` with an empty 500
// while a forged one was correctly rejected. TypeScript had flagged it, and a
// cast silenced the warning instead of the cause.
//
// Written to work either way, since other svix versions do return the parsed
// body, and kept in lib/ so the runner can actually test it.

export function resendEventFrom<T>(verified: unknown, rawBody: string): T {
  if (verified && typeof verified === "object") return verified as T;
  return JSON.parse(rawBody) as T;
}
