// lib/marketing/sms-worker.ts — server only
//
// Wires the pure worker in sms-worker-core to Supabase and the configured SMS
// provider. The cron route is a thin wrapper around runSmsWorker().
//
// Pacing is a flat throughput cap. Telnyx on a registered 10DLC long code has
// no new-contact quota and no consecutive-outbound ceiling, so a run costs no
// extra queries to work out what it is allowed to send.
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueRecord } from "@/lib/supabase";
import { smsLimits, siteUrl } from "./config";
import { denverHour } from "./quiet-hours";
import { maxMessagesPerRun } from "./sms-budget";
import { backoffMs, isRetryableError, MAX_ATTEMPTS } from "./sms-status";
import { telnyx } from "./telnyx";
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

export async function runSmsWorker(): Promise<WorkerRunResult> {
  const sb = getSupabase();
  const limits = smsLimits();
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
    // p_allow_new_contact is always true. The parameter is a leftover from an
    // earlier provider that metered new conversations separately; Telnyx draws
    // no such distinction. The RPC signature is left alone rather than editing
    // a migration that may already have been applied.
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
      telnyx.send({
        to: item.toNumber,
        body: item.body,
        statusCallback: `${siteUrl()}/api/webhooks/telnyx`,
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

  return runWorker(deps, {
    // SMS_MAX_PER_MINUTE is a sustained rate, so one run may send that rate
    // times the cron interval. Treating it as a per-run figure would deliver a
    // fifth of what the setting appears to promise.
    maxThisRun: maxMessagesPerRun(limits.maxPerMinute),
    quietHoursStart: limits.quietHoursStart,
    quietHoursEnd: limits.quietHoursEnd,
    currentHour: denverHour(now),
    maxAttempts: MAX_ATTEMPTS,
    backoffMs,
    isRetryable: isRetryableError,
    now,
  });
}
