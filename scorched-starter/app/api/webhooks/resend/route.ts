// app/api/webhooks/resend/route.ts
//
// Keeps email_status honest about what actually happens to our mail. A bounce
// means the address is dead; a complaint means someone pressed the spam
// button. Both must stop future sends, or the sending domain's reputation
// pays for it.
//
// Resend signs webhooks with Svix (svix-id, svix-timestamp, svix-signature),
// not a plain HMAC header, so verification goes through the svix package
// against the raw request body.
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { getSupabase } from "@/lib/supabase";
import type { EmailStatus, SubscriberRecord } from "@/lib/supabase";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

type ResendTag = { name?: string; value?: string };

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    to?: string[] | string;
    email_id?: string;
    created_at?: string;
    tags?: ResendTag[] | Record<string, string>;
  };
};

// Every event worth counting on the campaign page, mapped to the short name
// stored in email_events.
const TRACKED_EVENTS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

// Tags come back either as an array of {name, value} or as a plain object,
// depending on the event. Handle both rather than guessing.
function campaignIdFrom(event: ResendEvent): string | null {
  const tags = event.data?.tags;
  if (!tags) return null;
  if (Array.isArray(tags)) {
    return tags.find((t) => t?.name === "campaign_id")?.value ?? null;
  }
  return tags["campaign_id"] ?? null;
}

// Only the events that change whether we may send. Everything else is
// acknowledged and ignored rather than 404'd, so Resend does not retry.
const STATUS_BY_EVENT: Record<string, EmailStatus> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
};

function recipientsOf(event: ResendEvent): string[] {
  const to = event.data?.to;
  if (!to) return [];
  return (Array.isArray(to) ? to : [to]).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  // Must be the raw body: the signature covers the exact bytes, so parsing and
  // re-serializing would break verification.
  const payload = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_NO_SECRET");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as unknown as ResendEvent;
  } catch (err) {
    console.error("RESEND_WEBHOOK_SIG_ERROR", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = event.type ? TRACKED_EVENTS[event.type] : undefined;
  if (!eventType) return Response.json({ ok: true, ignored: event.type ?? null });

  const emails = recipientsOf(event);
  if (emails.length === 0) return Response.json({ ok: true, ignored: "no recipient" });

  const sb = getSupabase();
  const campaignId = campaignIdFrom(event);
  const occurredAt = event.created_at ?? event.data?.created_at ?? null;

  // Recorded for every tracked event, which is what the admin campaign page
  // counts. Upserted because Resend retries and a repeat must not inflate the
  // numbers.
  if (event.data?.email_id) {
    const { error: eventError } = await sb.from("email_events").upsert(
      {
        campaign_id: campaignId,
        email: emails[0],
        event_type: eventType,
        provider_email_id: event.data.email_id,
        occurred_at: occurredAt,
        raw_payload: event,
      },
      { onConflict: "provider_email_id,event_type", ignoreDuplicates: true }
    );
    if (eventError) console.error("EMAIL_EVENT_LOG_ERROR", eventError);
  }

  const nextStatus = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  // Only a bounce or a complaint changes whether we may send again. An open or
  // a click is a statistic, not a consent change.
  if (!nextStatus) return Response.json({ ok: true, recorded: eventType });

  for (const email of emails) {
    const { data, error } = await sb
      .from("subscribers")
      .update({ email_status: nextStatus })
      .eq("email", email)
      .select()
      .maybeSingle();

    if (error) {
      console.error("RESEND_WEBHOOK_UPDATE_ERROR", { email, error });
      continue;
    }
    if (!data) continue;

    const subscriber = data as SubscriberRecord;

    // A bounce or complaint is not a consent action, so it does not belong in
    // consent_events, which records what the person chose. This is the
    // provider telling us the address is unusable.
    await syncSubscriberToResend(subscriber);
  }

  return Response.json({ ok: true });
}
