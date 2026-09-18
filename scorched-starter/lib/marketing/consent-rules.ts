// lib/marketing/consent-rules.ts
//
// Pure status-transition rules, kept free of any Supabase import so the
// project's test runner (plain node --test, relative imports, no path alias)
// can exercise them. consent.ts holds the database work and calls into here.
import type { ConsentSource, EmailStatus, SmsStatus } from "../supabase.ts";

// A spam complaint is a far stronger signal than an unchecked box, and mailing
// a complainer again is how a sending domain gets blocked. A checkbox may
// revive an 'unsubscribed' or 'bounced' address, but only an admin acting
// deliberately can bring back a 'complained' one.
export function nextEmailStatus(
  current: EmailStatus | null,
  optIn: boolean,
  source: ConsentSource
): EmailStatus {
  if (!optIn) return "unsubscribed";
  if (current === "complained" && source !== "admin") return "complained";
  return "subscribed";
}

// 'invalid' means a carrier rejected the number, so someone typing it into a
// form again is a real correction and is allowed to clear it.
export function nextSmsStatus(_current: SmsStatus | null, optIn: boolean): SmsStatus {
  return optIn ? "subscribed" : "unsubscribed";
}

// When two subscriber rows turn out to be one person, statuses merge
// pessimistically: any opt-out on either side wins, because the safe failure
// is sending too little.
export function mergeEmailStatus(a: EmailStatus, b: EmailStatus): EmailStatus {
  const optedOut: EmailStatus[] = ["complained", "bounced", "unsubscribed"];
  for (const status of optedOut) {
    if (a === status || b === status) return status;
  }
  return a === "subscribed" || b === "subscribed" ? "subscribed" : "none";
}

export function mergeSmsStatus(a: SmsStatus, b: SmsStatus): SmsStatus {
  if (a === "unsubscribed" || b === "unsubscribed") return "unsubscribed";
  if (a === "invalid" || b === "invalid") return "invalid";
  return a === "subscribed" || b === "subscribed" ? "subscribed" : "none";
}

// Whether a subscriber counts as a "new contact": nobody we have exchanged a
// message with, in either direction, inside the window. Nothing paces against
// this any more, but sms_queue.is_new_contact still records it, and it is a
// useful way to tell a cold list from a warm one.
export const NEW_CONTACT_WINDOW_DAYS = 30;

export function isNewContact(
  lastSmsContactAt: string | null,
  now: Date = new Date(),
  windowDays: number = NEW_CONTACT_WINDOW_DAYS
): boolean {
  if (!lastSmsContactAt) return true;
  const last = new Date(lastSmsContactAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > windowDays * 86400000;
}
