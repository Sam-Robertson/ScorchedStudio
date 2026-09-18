// lib/marketing/resend-audience.ts — server only
//
// Mirrors subscriber state into Resend. Supabase stays the source of truth;
// this exists so the Resend dashboard shows a list that matches ours and so
// broadcast-side suppression agrees with our own.
//
// A failure here is logged and swallowed on purpose. Resend being down must
// never fail a waiver, a booking, or a footer signup, and the next status
// change re-syncs anyway.
//
// Note on naming: Resend has renamed audiences to segments. The contacts
// endpoint is now top level (POST /contacts) and takes a `segments` array.
// RESEND_AUDIENCE_ID keeps its spec-mandated name but holds a segment id.
import { Resend } from "resend";
import type { SubscriberRecord } from "@/lib/supabase";
import { marketingIsLive, logSuppressedSend } from "./config";

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_SYNC_SKIPPED missing RESEND_API_KEY");
    return null;
  }
  return new Resend(key);
}

// Resend only needs to know two things: does this address exist on the list,
// and is it unsubscribed. Every one of our email statuses other than
// 'subscribed' means "do not send", so they all map to unsubscribed.
function isUnsubscribedInResend(subscriber: SubscriberRecord): boolean {
  return subscriber.email_status !== "subscribed";
}

export async function syncSubscriberToResend(subscriber: SubscriberRecord): Promise<void> {
  if (!subscriber.email) return;

  const segmentId = process.env.RESEND_AUDIENCE_ID;
  if (!segmentId) {
    console.warn("RESEND_SYNC_SKIPPED missing RESEND_AUDIENCE_ID");
    return;
  }

  const unsubscribed = isUnsubscribedInResend(subscriber);

  // Mirroring list membership is not a send, but it still writes to a real
  // third-party account, so it waits for the same gate as everything else.
  if (!marketingIsLive()) {
    logSuppressedSend("resend-contact-sync", {
      email: subscriber.email,
      unsubscribed,
      segmentId,
    });
    return;
  }

  const resend = resendClient();
  if (!resend) return;

  try {
    // Create is an upsert by email in practice: an address already on the
    // segment comes back as a conflict, which the update below then handles.
    const created = await resend.contacts.create({
      email: subscriber.email,
      firstName: subscriber.first_name ?? undefined,
      lastName: subscriber.last_name ?? undefined,
      unsubscribed,
      audienceId: segmentId,
    });

    if (created.error) {
      // Already present: patch the subscription flag instead.
      await resend.contacts.update({
        email: subscriber.email,
        audienceId: segmentId,
        unsubscribed,
        firstName: subscriber.first_name ?? undefined,
        lastName: subscriber.last_name ?? undefined,
      });
    }
  } catch (err) {
    console.error("RESEND_SYNC_ERROR", { email: subscriber.email, err });
  }
}
