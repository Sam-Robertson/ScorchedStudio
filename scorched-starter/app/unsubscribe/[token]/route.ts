// app/unsubscribe/[token]/route.ts
//
// One click, no login. GET shows a confirmation page, POST is the RFC 8058
// one-click endpoint that mail clients call from the List-Unsubscribe-Post
// header.
//
// This is a route handler rather than a page because App Router pages only
// serve GET, and both verbs have to hit the same URL for one-click to work.
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { SubscriberRecord } from "@/lib/supabase";
import { EMAIL_UNSUBSCRIBE_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

// The token is the only credential here, so an unknown one must not reveal
// whether it ever existed. Both outcomes render the same confirmation.
async function unsubscribeByToken(
  token: string,
  req: NextRequest
): Promise<{ ok: boolean }> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("subscribers")
    .select("*")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error) {
    console.error("UNSUBSCRIBE_LOOKUP_ERROR", error);
    return { ok: false };
  }
  const subscriber = data as SubscriberRecord | null;
  if (!subscriber) return { ok: true };

  // Already unsubscribed is a success, not an error. Mail clients retry the
  // one-click POST and a second click must not look like a failure.
  if (subscriber.email_status === "unsubscribed") return { ok: true };

  const { data: updated, error: updateError } = await sb
    .from("subscribers")
    .update({ email_status: "unsubscribed" })
    .eq("id", subscriber.id)
    .select()
    .single();

  if (updateError) {
    console.error("UNSUBSCRIBE_UPDATE_ERROR", updateError);
    return { ok: false };
  }

  const { ip, userAgent } = consentMetaFrom(req);
  const { error: logError } = await sb.from("consent_events").insert({
    subscriber_id: subscriber.id,
    channel: "email",
    action: "opt_out",
    source: "unsubscribe_link",
    consent_text: EMAIL_UNSUBSCRIBE_CONSENT_TEXT,
    ip,
    user_agent: userAgent,
  });
  if (logError) console.error("UNSUBSCRIBE_LOG_ERROR", logError);

  await syncSubscriberToResend(updated as SubscriberRecord);

  return { ok: true };
}

function page(title: string, message: string, status: number): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title} | Scorched Studio</title>
    <style>
      body { margin:0; background:#faf9f7; color:#3A3A3A; font-family: system-ui, sans-serif;
             display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; }
      .card { max-width:460px; background:#fff; border:1px solid #eee; border-radius:16px; padding:32px; }
      h1 { font-size:20px; margin:0 0 12px; }
      p { font-size:15px; line-height:1.6; color:#555; margin:0 0 12px; }
      a { color:#884A20; }
      .brand { font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#884A20; margin:0 0 16px; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="brand">Scorched Studio</p>
      <h1>${title}</h1>
      <p>${message}</p>
      <p>Changed your mind? <a href="https://scorchedstudio.com">Sign up again from our site</a>.</p>
    </div>
  </body>
</html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { ok } = await unsubscribeByToken(token, req);

  if (!ok) {
    return page(
      "Something went wrong",
      "We could not update your preferences just now. Please email contact@scorchedstudio.com and we will take you off the list by hand.",
      500
    );
  }

  return page(
    "You are unsubscribed",
    "You will not get any more marketing email from us. Booking confirmations, waiver copies, and receipts still come through, because those are tied to your visits rather than to a mailing list.",
    200
  );
}

// One-click. Mail clients expect a fast 2xx and ignore the body.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { ok } = await unsubscribeByToken(token, req);
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
