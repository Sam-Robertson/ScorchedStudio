// lib/marketing/phone.ts
//
// Every phone number that reaches subscribers.phone goes through here first.
// The column has a CHECK for E.164, so a number that slips past this function
// fails the insert rather than sitting in the table in a format the provider
// will reject at send time.
//
// Default region is US: the studios are in Utah and the existing booking and
// waiver forms collect 10-digit local numbers with no country code.
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const DEFAULT_REGION = "US" as const;

// Returns the number in E.164 ("+18013619066"), or null if it is not a valid
// dialable number. Null is a normal outcome, not an error: the waiver form
// treats phone as optional and people do type nonsense into it.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = String(input).trim();
  if (!trimmed) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
    if (!parsed || !parsed.isValid()) return null;

    // Reject anything that is valid but cannot receive a text, such as a
    // toll-free-style landline. libphonenumber cannot always tell, and
    // getType() returns undefined for plenty of real mobiles, so this only
    // rejects the types it is confident are not textable.
    const type = parsed.getType();
    if (type === "VOIP" || type === "PAGER" || type === "UAN") return null;

    return parsed.number;
  } catch {
    return null;
  }
}

// True if the string is already exactly E.164. Used by the import script to
// separate "already clean" from "needed fixing" in its dry-run counts.
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

// For display in the admin table. Falls back to the raw stored value rather
// than hiding a number we failed to format.
export function formatPhoneForDisplay(e164: string | null): string {
  if (!e164) return "";
  try {
    const parsed = parsePhoneNumberFromString(e164);
    if (!parsed) return e164;
    return parsed.country === "US" ? parsed.formatNational() : parsed.formatInternational();
  } catch {
    return e164;
  }
}
