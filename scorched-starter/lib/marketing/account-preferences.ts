// lib/marketing/account-preferences.ts — server only
//
// Marketing preferences for a signed-in customer, read and written by the
// /account page.
//
// Everything goes through recordConsent like every other capture point, so an
// account toggle produces the same evidence as a checkbox on the waiver: the
// wording shown, the source, the timestamp, the IP.
import { getSupabase } from "@/lib/supabase";
import type { SubscriberRecord } from "@/lib/supabase";
import { recordConsent } from "./consent";
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT } from "./consent-copy";
import { normalizePhone } from "./phone";
import { syncSubscriberToResend } from "./resend-audience";

export type AccountMarketingPrefs = {
  emailOptedIn: boolean;
  smsOptedIn: boolean;
  // The number we would text, if we have one. Shown so nobody has to guess
  // which of their numbers is on file.
  phone: string | null;
  // A complaint or a bounce is not something a customer can undo by ticking a
  // box, so the page explains rather than silently failing to turn back on.
  emailBlocked: boolean;
};

async function subscriberFor(email: string): Promise<SubscriberRecord | null> {
  const { data, error } = await getSupabase()
    .from("subscribers")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`subscriber lookup failed: ${error.message}`);
  return (data as SubscriberRecord | null) ?? null;
}

// If they have never joined a list we still know a phone number from their
// bookings, which saves them typing one they already gave us.
async function phoneFromHistory(email: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from("bookings")
    .select("phone,created_at")
    .eq("email", email)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const raw = (data ?? [])[0]?.phone as string | undefined;
  return raw ? normalizePhone(raw) : null;
}

export async function getAccountMarketingPrefs(email: string): Promise<AccountMarketingPrefs> {
  const subscriber = await subscriberFor(email);

  return {
    emailOptedIn: subscriber?.email_status === "subscribed",
    smsOptedIn: subscriber?.sms_status === "subscribed",
    phone: subscriber?.phone ?? (await phoneFromHistory(email)),
    emailBlocked:
      subscriber?.email_status === "bounced" || subscriber?.email_status === "complained",
  };
}

export type UpdateResult =
  | { ok: true; prefs: AccountMarketingPrefs }
  | { ok: false; reason: "phone-required" | "phone-invalid" };

export async function updateAccountMarketingPrefs(args: {
  email: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  phone?: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<UpdateResult> {
  const current = await getAccountMarketingPrefs(args.email);

  // Turning texts on needs a number. Use the one they typed, else the one
  // already on file.
  let phone = current.phone;
  if (args.smsOptIn) {
    if (args.phone && args.phone.trim()) {
      const normalized = normalizePhone(args.phone);
      if (!normalized) return { ok: false, reason: "phone-invalid" };
      phone = normalized;
    }
    if (!phone) return { ok: false, reason: "phone-required" };
  }

  // Only the channels that actually changed are written, so re-saving the form
  // untouched does not fill the consent log with duplicate rows.
  const channels: { channel: "email" | "sms"; optIn: boolean }[] = [];
  if (args.emailOptIn !== current.emailOptedIn) {
    channels.push({ channel: "email", optIn: args.emailOptIn });
  }
  if (args.smsOptIn !== current.smsOptedIn) {
    channels.push({ channel: "sms", optIn: args.smsOptIn });
  }

  if (channels.length === 0) return { ok: true, prefs: current };

  const consentText = channels
    .map((c) => (c.channel === "email" ? EMAIL_CONSENT_TEXT : SMS_CONSENT_TEXT))
    .join(" ");

  const result = await recordConsent({
    email: args.email,
    // Only sent when opting in, so declining texts never quietly attaches a
    // number to the record.
    phone: args.smsOptIn ? phone : null,
    channels,
    source: "account_settings",
    consentText,
    ip: args.ip,
    userAgent: args.userAgent,
  });

  if (result.applied.includes("email")) await syncSubscriberToResend(result.subscriber);

  return { ok: true, prefs: await getAccountMarketingPrefs(args.email) };
}
