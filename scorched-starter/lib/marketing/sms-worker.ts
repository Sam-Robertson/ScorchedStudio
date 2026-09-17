// lib/marketing/sms-worker.ts — server only
//
// Wires the pure worker in sms-worker-core to Supabase and the configured SMS
// provider. The cron route is a thin wrapper around runSmsWorker().
//
// Pacing depends on the provider. Telnyx, on a registered 10DLC long code, has
// no new-contact quota and no consecutive-outbound ceiling, so it is a flat
// throughput cap and the run costs no extra queries. Sendblue keeps its quota
// accounting in pacingFor(), so selecting it actually honours its limits
// instead of firing at the Telnyx rate past the caps that made us leave it.
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueRecord } from "@/lib/supabase";
import { smsLimits, siteUrl, smsProviderName } from "./config";
import { denverHour } from "./quiet-hours";
import { computeBudget, maxMessagesPerRun } from "./sms-budget";
import { backoffMs, isRetryableError, MAX_ATTEMPTS } from "./sms-status";
import { smsProvider } from "./sms-provider-registry";
import { SMS_STOP_CONSENT_TEXT } from "./consent-copy";
import { runWorker, type QueueItem, type WorkerDeps, type WorkerRunResult } from "./sms-worker-core";

function toItem(row: SmsQueueRecord): QueueItem {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    subscriberId: row.subscriber_id,
    toNumber: row.to_number,
    body: row.body,
    isNewContact: row.is_new_contact,
    attempts: row.attempts,
  };
}

// Counts new-contact sends already made in a trailing window. Sendblue only:
// its plan caps how many people you may start a conversation with.
async function newContactsSent(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("sms_queue")
    .select("id", { count: "exact", head: true })
    .eq("is_new_contact", true)
    .in("status", ["sending", "sent", "delivered"])
    .gte("updated_at", sinceIso);

  if (error) throw new Error(`new contact count failed: ${error.message}`);
  return count ?? 0;
}

// How many outbound messages have gone out since the most recent inbound one.
// Sendblue stops delivering past its ceiling and says it cannot be disabled,
// so the worker has to track it rather than discover it as silent failures.
async function consecutiveOutboundWithoutReply(): Promise<number> {
  const sb = getSupabase();

  const { data: lastInbound, error: inboundErr } = await sb
    .from("sms_messages")
    .select("created_at")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundErr) throw new Error(`inbound lookup failed: ${inboundErr.message}`);

  let query = sb
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound");
  if (lastInbound?.created_at) query = query.gt("created_at", lastInbound.created_at);

  const { count, error } = await query;
  if (error) throw new Error(`outbound count failed: ${error.message}`);
  return count ?? 0;
}

// How many this run may send, and whether the provider is blocked outright.
//
// Telnyx is a flat throughput cap. Sendblue keeps its quota accounting, so
// selecting it with SMS_PROVIDER actually honours its limits rather than
// firing at the Telnyx rate straight past the caps that made us leave it.
async function pacingFor(
  providerName: string,
  limits: ReturnType<typeof smsLimits>
): Promise<{ maxThisRun: number; blockedReason: string | null }> {
  if (providerName !== "sendblue") {
    return { maxThisRun: maxMessagesPerRun(limits.maxPerMinute), blockedReason: null };
  }

  const now = Date.now();
  const [sentLastHour, sentLastDay, consecutive] = await Promise.all([
    newContactsSent(new Date(now - 3600_000).toISOString()),
    newContactsSent(new Date(now - 86400_000).toISOString()),
    consecutiveOutboundWithoutReply(),
  ]);

  const budget = computeBudget({
    newContactsPerHour: limits.newContactsPerHour,
    newContactsPerDay: limits.newContactsPerDay,
    burstPerSecond: limits.burstPerSecond,
    newContactsSentLastHour: sentLastHour,
    newContactsSentLastDay: sentLastDay,
    runSeconds: 60,
    maxConsecutiveNoReply: limits.maxConsecutiveNoReply,
    consecutiveNoReply: consecutive,
  });

  // The new-contact allowance is the binding constraint on that plan, and the
  // claim no longer separates new from established, so the tighter of the two
  // governs the whole run.
  return {
    maxThisRun: Math.min(budget.total, budget.newContacts),
    blockedReason: budget.blockedReason,
  };
}

export async function runSmsWorker(): Promise<WorkerRunResult> {
  const sb = getSupabase();
  const limits = smsLimits();
  const provider = smsProvider();
  const now = new Date();

  const deps: WorkerDeps = {
    // Single-runner lease. It expires on its own, so a run that crashes
    // mid-flight does not wedge the queue until someone notices.
    acquireLock: async () => {
      const { data, error } = await sb.rpc("acquire_marketing_worker_lock", {
        p_name: "sms_worker",
        p_seconds: 120,
      });
      if (error) throw new Error(`lock acquire failed: ${error.message}`);
      return data === true;
    },
    releaseLock: async () => {
      const { error } = await sb.rpc("release_marketing_worker_lock", { p_name: "sms_worker" });
      if (error) console.error("SMS_WORKER_LOCK_RELEASE_ERROR", error);
    },

    // The atomic claim. claim_sms_queue_batch flips rows to 'sending' inside
    // the same statement that selects them, using FOR UPDATE SKIP LOCKED, so
    // two overlapping cron runs get disjoint sets.
    //
    // p_allow_new_contact is passed true unconditionally now. That parameter
    // existed so the Sendblue path could drain established contacts before
    // spending its new-contact quota; Telnyx draws no such distinction. The RPC
    // signature is left alone rather than editing a migration Sam may have run.
    claim: async (limit: number) => {
      const { data, error } = await sb.rpc("claim_sms_queue_batch", {
        p_limit: limit,
        p_allow_new_contact: true,
        p_campaign_id: null,
      });
      if (error) throw new Error(`claim failed: ${error.message}`);
      return ((data ?? []) as SmsQueueRecord[]).map(toItem);
    },

    isStillSubscribed: async (subscriberId) => {
      const { data, error } = await sb
        .from("subscribers")
        .select("sms_status")
        .eq("id", subscriberId)
        .maybeSingle();
      if (error) {
        console.error("SMS_WORKER_STATUS_CHECK_ERROR", error);
        return false; // fail closed: do not send when we cannot confirm consent
      }
      return data?.sms_status === "subscribed";
    },

    send: async (item) =>
      provider.send({
        to: item.toNumber,
        body: item.body,
        statusCallback: `${siteUrl()}/api/webhooks/${provider.name}`,
      }),

    markSent: async (item, handle, status, suppressed) => {
      await sb
        .from("sms_queue")
        .update({ status: "sent", provider_message_handle: handle, error_code: null, error_message: null })
        .eq("id", item.id);
      // A suppressed send writes no sms_messages row: nothing was delivered,
      // and that log is meant to be what actually happened on the wire.
      if (status && !suppressed) {
        await sb.from("sms_messages").upsert(
          {
            provider_message_handle: handle,
            direction: "outbound",
            to_number: item.toNumber,
            content: item.body,
            status,
            occurred_at: new Date().toISOString(),
          },
          { onConflict: "provider_message_handle" }
        );
      }
    },

    markSkipped: async (item, reason) => {
      await sb
        .from("sms_queue")
        .update({ status: "skipped", error_message: reason })
        .eq("id", item.id);
    },

    // The provider refused because this person is on its opt-out list and our
    // record had not caught up. Correct both: the queue row is skipped rather
    // than failed, and the subscriber is unsubscribed with a consent event, so
    // Supabase stops disagreeing with the provider about who may be messaged.
    markOptedOut: async (item, reason) => {
      await sb
        .from("sms_queue")
        .update({ status: "skipped", error_message: reason })
        .eq("id", item.id);

      const { error } = await sb
        .from("subscribers")
        .update({ sms_status: "unsubscribed" })
        .eq("id", item.subscriberId);
      if (error) {
        console.error("SMS_WORKER_OPTOUT_UPDATE_ERROR", error);
        return;
      }

      const { error: logError } = await sb.from("consent_events").insert({
        subscriber_id: item.subscriberId,
        channel: "sms",
        action: "opt_out",
        source: "inbound_keyword",
        consent_text: SMS_STOP_CONSENT_TEXT,
      });
      if (logError) console.error("SMS_WORKER_OPTOUT_LOG_ERROR", logError);
    },

    markFailed: async (item, errorCode, errorMessage) => {
      await sb
        .from("sms_queue")
        .update({ status: "failed", error_code: errorCode, error_message: errorMessage })
        .eq("id", item.id);
    },

    // Back to 'pending' with a later send_after. attempts was already
    // incremented by the claim, so the backoff grows on each pass.
    retryLater: async (item, sendAfter, errorCode) => {
      await sb
        .from("sms_queue")
        .update({ status: "pending", send_after: sendAfter.toISOString(), error_code: errorCode })
        .eq("id", item.id);
    },

    markContacted: async (subscriberId) => {
      await sb
        .from("subscribers")
        .update({ last_sms_contact_at: new Date().toISOString() })
        .eq("id", subscriberId);
    },
  };

  // SMS_MAX_PER_MINUTE is a sustained rate, so one Telnyx run may send that
  // rate times the cron interval. Treating it as a per-run figure would
  // deliver a fifth of what the setting appears to promise.
  const pacing = await pacingFor(smsProviderName(), limits);

  return runWorker(deps, {
    maxThisRun: pacing.maxThisRun,
    blockedReason: pacing.blockedReason,
    quietHoursStart: limits.quietHoursStart,
    quietHoursEnd: limits.quietHoursEnd,
    currentHour: denverHour(now),
    maxAttempts: MAX_ATTEMPTS,
    backoffMs,
    isRetryable: isRetryableError,
    now,
  });
}
