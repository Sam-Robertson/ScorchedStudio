// lib/marketing/consent.ts — server only
//
// The single writer for the subscribers table. Every capture point (waiver,
// booking checkout, footer form, admin, imports, inbound STOP) goes through
// recordConsent so that no path can add someone to a marketing list without
// also writing the evidence of how they got there.
//
// Nothing else in the codebase should insert or update subscribers directly.
import { getSupabase } from "@/lib/supabase";
import type {
  ConsentSource,
  MarketingChannel,
  SubscriberRecord,
} from "@/lib/supabase";
import { normalizePhone } from "./phone";
import {
  mergeEmailStatus,
  mergeSmsStatus,
  nextEmailStatus,
  nextSmsStatus,
} from "./consent-rules";

export type ConsentChannelInput = {
  channel: MarketingChannel;
  // false records an explicit opt-out, which is what the unsubscribe link and
  // an inbound STOP both do.
  optIn: boolean;
};

export type RecordConsentInput = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  channels: ConsentChannelInput[];
  source: ConsentSource;
  consentText: string;
  ip?: string | null;
  userAgent?: string | null;
  tags?: string[];
  // Imports pass the original opt-in date; everything else defaults to now.
  occurredAt?: string | null;
};

export type RecordConsentResult = {
  subscriber: SubscriberRecord;
  // Which channels actually changed status, for the caller to log.
  applied: MarketingChannel[];
};

export class NoContactInfoError extends Error {
  constructor() {
    super("recordConsent needs at least an email or a valid phone number");
    this.name = "NoContactInfoError";
  }
}

// Find whoever this person already is. Email and phone are independently
// unique, so a submission carrying both can match two different existing rows
// (someone signed up by email years ago and texted in from a phone we only
// know separately). Returning both lets the caller merge instead of crashing
// on a unique violation.
async function findExisting(
  email: string | null,
  phone: string | null
): Promise<{ byEmail: SubscriberRecord | null; byPhone: SubscriberRecord | null }> {
  const sb = getSupabase();

  const [emailRes, phoneRes] = await Promise.all([
    email
      ? sb.from("subscribers").select("*").eq("email", email).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    phone
      ? sb.from("subscribers").select("*").eq("phone", phone).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (emailRes.error) throw new Error(`subscriber lookup by email failed: ${emailRes.error.message}`);
  if (phoneRes.error) throw new Error(`subscriber lookup by phone failed: ${phoneRes.error.message}`);

  return {
    byEmail: (emailRes.data as SubscriberRecord | null) ?? null,
    byPhone: (phoneRes.data as SubscriberRecord | null) ?? null,
  };
}

// Two rows turn out to be the same person. Keep the older row as the survivor
// (it holds the earliest consent date and any token already mailed out), move
// the loser's consent history and queue rows onto it, then delete the loser.
//
// Statuses merge pessimistically: if either side had opted out of a channel,
// the merged row stays opted out until this submission explicitly opts back in.
async function mergeSubscribers(
  survivor: SubscriberRecord,
  loser: SubscriberRecord
): Promise<SubscriberRecord> {
  const sb = getSupabase();

  const mergedEmailStatus = mergeEmailStatus(survivor.email_status, loser.email_status);
  const mergedSmsStatus = mergeSmsStatus(survivor.sms_status, loser.sms_status);

  // Move the audit trail before deleting, so the cascade cannot eat it.
  const { error: moveConsent } = await sb
    .from("consent_events")
    .update({ subscriber_id: survivor.id })
    .eq("subscriber_id", loser.id);
  if (moveConsent) throw new Error(`consent merge failed: ${moveConsent.message}`);

  const { error: moveQueue } = await sb
    .from("sms_queue")
    .update({ subscriber_id: survivor.id })
    .eq("subscriber_id", loser.id);
  if (moveQueue) throw new Error(`queue merge failed: ${moveQueue.message}`);

  const lastContact = [survivor.last_sms_contact_at, loser.last_sms_contact_at]
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();

  const { error: delErr } = await sb.from("subscribers").delete().eq("id", loser.id);
  if (delErr) throw new Error(`merge cleanup failed: ${delErr.message}`);

  const { data, error } = await sb
    .from("subscribers")
    .update({
      email: survivor.email ?? loser.email,
      phone: survivor.phone ?? loser.phone,
      first_name: survivor.first_name ?? loser.first_name,
      last_name: survivor.last_name ?? loser.last_name,
      email_status: mergedEmailStatus,
      sms_status: mergedSmsStatus,
      tags: Array.from(new Set([...survivor.tags, ...loser.tags])),
      last_sms_contact_at: lastContact ?? null,
    })
    .eq("id", survivor.id)
    .select()
    .single();

  if (error) throw new Error(`merge update failed: ${error.message}`);
  return data as SubscriberRecord;
}

export async function recordConsent(input: RecordConsentInput): Promise<RecordConsentResult> {
  const sb = getSupabase();

  const email = input.email?.trim().toLowerCase() || null;
  const phone = normalizePhone(input.phone);

  // A phone number that fails to normalize is dropped rather than stored in a
  // format that would fail the E.164 CHECK. If that leaves nothing to key on,
  // there is no subscriber to record.
  if (!email && !phone) throw new NoContactInfoError();

  const { byEmail, byPhone } = await findExisting(email, phone);

  let existing: SubscriberRecord | null = null;
  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    const [older, newer] =
      byEmail.created_at <= byPhone.created_at ? [byEmail, byPhone] : [byPhone, byEmail];
    existing = await mergeSubscribers(older, newer);
  } else {
    existing = byEmail ?? byPhone;
  }

  const wantsEmail = input.channels.find((c) => c.channel === "email");
  const wantsSms = input.channels.find((c) => c.channel === "sms");

  const nextTags = Array.from(new Set([...(existing?.tags ?? []), ...(input.tags ?? [])]));

  const patch: Record<string, unknown> = {
    // Never overwrite a known value with null: the booking form collects a
    // phone the footer form does not, and the second signup must not erase it.
    email: email ?? existing?.email ?? null,
    phone: phone ?? existing?.phone ?? null,
    first_name: input.firstName?.trim() || existing?.first_name || null,
    last_name: input.lastName?.trim() || existing?.last_name || null,
    tags: nextTags,
  };

  const applied: MarketingChannel[] = [];

  if (wantsEmail && patch.email) {
    patch.email_status = nextEmailStatus(existing?.email_status ?? null, wantsEmail.optIn, input.source);
    applied.push("email");
  }
  if (wantsSms && patch.phone) {
    patch.sms_status = nextSmsStatus(existing?.sms_status ?? null, wantsSms.optIn);
    applied.push("sms");
  }

  let subscriber: SubscriberRecord;
  if (existing) {
    const { data, error } = await sb
      .from("subscribers")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`subscriber update failed: ${error.message}`);
    subscriber = data as SubscriberRecord;
  } else {
    const { data, error } = await sb.from("subscribers").insert(patch).select().single();
    if (error) throw new Error(`subscriber insert failed: ${error.message}`);
    subscriber = data as SubscriberRecord;
  }

  // One consent row per channel that actually applied. Written after the
  // subscriber exists so the foreign key always resolves.
  if (applied.length > 0) {
    const rows = applied.map((channel) => {
      const wanted = channel === "email" ? wantsEmail! : wantsSms!;
      return {
        subscriber_id: subscriber.id,
        channel,
        action: wanted.optIn ? "opt_in" : "opt_out",
        source: input.source,
        consent_text: input.consentText,
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      };
    });

    const { error } = await sb.from("consent_events").insert(rows);
    if (error) throw new Error(`consent log failed: ${error.message}`);
  }

  return { subscriber, applied };
}

// For the capture points bolted onto flows that must not break. An opt-in
// failing is not a reason for a waiver or a paid booking to fail, so these
// callers use this wrapper and carry on.
export async function recordConsentSafe(
  input: RecordConsentInput
): Promise<RecordConsentResult | null> {
  try {
    return await recordConsent(input);
  } catch (err) {
    console.error("RECORD_CONSENT_ERROR", { source: input.source, err });
    return null;
  }
}
