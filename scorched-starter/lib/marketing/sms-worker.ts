// lib/marketing/sms-worker.ts — server only
//
// Wires the pure worker in sms-worker-core to Supabase and Sendblue. The cron
// route is a thin wrapper around runSmsWorker().
import { getSupabase } from "@/lib/supabase";
import type { SmsQueueRecord } from "@/lib/supabase";
import { smsLimits, siteUrl } from "./config";
import { denverHour } from "./quiet-hours";
import { backoffMs, isRetryableError, MAX_ATTEMPTS } from "./sms-status";
import { sendblue } from "./sendblue";
import { runWorker, type QueueItem, type WorkerDeps, type WorkerRunResult } from "./sms-worker-core";

// How much of the five minute cron interval one run is willing to spend
// sending. Deliberately short of the whole window so a run cannot still be
// going when the next one starts.
const RUN_SECONDS = 60;

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

// Counts new-contact sends already made in the trailing windows. The worker
// budgets against a rolling 24 hours even though Sendblue's daily window
// resets at 3am ET, because rolling is the stricter reading and can never
// overshoot the provider's own accounting.
async function newContactsSent(sinceIso: string): Promise<number> {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("sms_queue")
    .select("id", { count: "exact", head: true })
    .eq("is_new_contact", true)
    .in("status", ["sending", "sent", "delivered"])
    .gte("updated_at", sinceIso);

  if (error) throw new Error(`new contact count failed: ${error.message}`);
  return count ?? 0;
}

// How many outbound messages have gone out on the line since the most recent
// inbound message. Sendblue stops delivering past 150 of these and says the
// limit cannot be disabled, so the worker has to track it rather than discover
// it as silent failures.
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

export async function runSmsWorker(): Promise<WorkerRunResult> {
  const sb = getSupabase();
  const limits = smsLimits();
  const now = new Date();

  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86400_000).toISOString();

  const [sentLastHour, sentLastDay, consecutive] = await Promise.all([
    newContactsSent(hourAgo),
    newContactsSent(dayAgo),
    consecutiveOutboundWithoutReply(),
  ]);

  const deps: WorkerDeps = {
    // Single-runner lease. The lease expires on its own, so a run that crashes
    // mid-flight does not wedge the queue until someone notices.
    acquireLock: async () => {
      const { data, error } = await sb.rpc("acquire_marketing_worker_lock", {
        p_name: "sms_worker",
        p_seconds: RUN_SECONDS * 2,
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
    claim: async (limit, allowNewContact) => {
      const { data, error } = await sb.rpc("claim_sms_queue_batch", {
        p_limit: limit,
        p_allow_new_contact: allowNewContact,
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
      sendblue.send({
        to: item.toNumber,
        body: item.body,
        statusCallback: `${siteUrl()}/api/webhooks/sendblue`,
      }),

    markSent: async (item, handle, status) => {
      await sb
        .from("sms_queue")
        .update({ status: "sent", provider_message_handle: handle, error_code: null, error_message: null })
        .eq("id", item.id);
      if (status) {
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
    budget: {
      newContactsPerHour: limits.newContactsPerHour,
      newContactsPerDay: limits.newContactsPerDay,
      burstPerSecond: limits.burstPerSecond,
      newContactsSentLastHour: sentLastHour,
      newContactsSentLastDay: sentLastDay,
      runSeconds: RUN_SECONDS,
      maxConsecutiveNoReply: limits.maxConsecutiveNoReply,
      consecutiveNoReply: consecutive,
    },
    quietHoursStart: limits.quietHoursStart,
    quietHoursEnd: limits.quietHoursEnd,
    currentHour: denverHour(now),
    maxAttempts: MAX_ATTEMPTS,
    backoffMs,
    isRetryable: isRetryableError,
    now,
  });
}
