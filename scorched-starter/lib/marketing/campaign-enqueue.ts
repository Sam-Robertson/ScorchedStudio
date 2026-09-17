// lib/marketing/campaign-enqueue.ts — server only
//
// Turns a campaign into sms_queue rows. This is the only place a campaign
// becomes sendable, and it is where the two things every outbound text needs
// get applied: the opt-out notice, and whether this person counts as a new
// contact for rate limiting.
//
// The body is frozen into each row at enqueue rather than read from the
// campaign at send time, so editing a draft mid-drip cannot change what half
// the list already received.
import { getSupabase } from "@/lib/supabase";
import type { CampaignRecord, SmsQueueRecord, SubscriberRecord } from "@/lib/supabase";
import { audienceFor } from "./audience";
import { isNewContact } from "./consent-rules";
import { withStopNotice } from "./message-rules";
import { smsLimits } from "./config";
import { estimateCompletion, type CompletionEstimate } from "./sms-budget";

export type EnqueueResult = {
  queued: number;
  alreadyQueued: number;
  newContacts: number;
  estimate: CompletionEstimate;
};

export async function enqueueSmsCampaign(campaign: CampaignRecord): Promise<EnqueueResult> {
  if (campaign.channel !== "sms") throw new Error("enqueueSmsCampaign called on an email campaign");

  const sb = getSupabase();
  const recipients = await audienceFor("sms", campaign.segment);
  const now = new Date();

  // Applied once here rather than per send, so what is stored is exactly what
  // goes out and an admin can read the queue to see the real message.
  const body = withStopNotice(campaign.body);

  const rows = recipients
    .filter((s: SubscriberRecord) => Boolean(s.phone))
    .map((s: SubscriberRecord) => ({
      campaign_id: campaign.id,
      subscriber_id: s.id,
      to_number: s.phone as string,
      body,
      is_new_contact: isNewContact(s.last_sms_contact_at, now),
    }));

  if (rows.length === 0) {
    return { queued: 0, alreadyQueued: 0, newContacts: 0, estimate: estimateCompletion(0, 0, 1, now) };
  }

  // UNIQUE (campaign_id, subscriber_id) makes this idempotent: re-running an
  // enqueue after a partial failure adds only what is missing and can never
  // double-send.
  const { data, error } = await sb
    .from("sms_queue")
    .upsert(rows, { onConflict: "campaign_id,subscriber_id", ignoreDuplicates: true })
    .select("id");

  if (error) throw new Error(`enqueue failed: ${error.message}`);

  const queued = data?.length ?? 0;
  const newContacts = rows.filter((r) => r.is_new_contact).length;

  // The worker only claims rows whose campaign is 'sending', so this flip is
  // what actually starts the drip. Pausing or cancelling flips it back and the
  // worker stops on its next run without any other coordination.
  const { error: statusError } = await sb
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", campaign.id);
  if (statusError) throw new Error(`campaign status update failed: ${statusError.message}`);

  return {
    queued,
    alreadyQueued: rows.length - queued,
    newContacts,
    estimate: estimateCompletion(newContacts, rows.length - newContacts, smsLimits().newContactsPerDay, now),
  };
}

export type CampaignSmsStats = {
  pending: number;
  sending: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  total: number;
  optOutsWithin48h: number;
  estimate: CompletionEstimate;
};

export async function campaignSmsStats(campaignId: string): Promise<CampaignSmsStats> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("sms_queue")
    .select("status,is_new_contact,subscriber_id")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`campaign stats failed: ${error.message}`);

  const rows = (data ?? []) as Pick<SmsQueueRecord, "status" | "is_new_contact" | "subscriber_id">[];

  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const pendingNew = rows.filter((r) => r.status === "pending" && r.is_new_contact).length;
  const pendingEstablished = rows.filter((r) => r.status === "pending" && !r.is_new_contact).length;

  // Opt-outs attributed to this campaign: an SMS opt-out from someone it was
  // sent to, inside 48 hours of the send. Attribution is by time rather than
  // anything the provider gives us, so it is an estimate, not a fact.
  let optOutsWithin48h = 0;
  const recipientIds = rows.map((r) => r.subscriber_id);
  if (recipientIds.length > 0) {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { count: optOuts, error: optErr } = await sb
      .from("consent_events")
      .select("id", { count: "exact", head: true })
      .eq("channel", "sms")
      .eq("action", "opt_out")
      .gte("occurred_at", since)
      .in("subscriber_id", recipientIds);
    if (optErr) console.error("CAMPAIGN_OPTOUT_COUNT_ERROR", optErr);
    optOutsWithin48h = optOuts ?? 0;
  }

  return {
    pending: count("pending"),
    sending: count("sending"),
    sent: count("sent"),
    delivered: count("delivered"),
    failed: count("failed"),
    skipped: count("skipped"),
    total: rows.length,
    optOutsWithin48h,
    estimate: estimateCompletion(pendingNew, pendingEstablished, smsLimits().newContactsPerDay),
  };
}
