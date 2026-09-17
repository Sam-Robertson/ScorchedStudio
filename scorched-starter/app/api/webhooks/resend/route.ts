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

type ResendEvent = {
  type?: string;
  data?: { to?: string[] | string; email_id?: string };
};

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

  const nextStatus = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  if (!nextStatus) return Response.json({ ok: true, ignored: event.type ?? null });

  const emails = recipientsOf(event);
  if (emails.length === 0) return Response.json({ ok: true, ignored: "no recipient" });

  const sb = getSupabase();

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
