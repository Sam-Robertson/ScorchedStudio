// app/api/newsletter/route.ts
//
// The footer signup. This used to insert straight into newsletter_subscribers
// with no record of what anyone agreed to. It now goes through recordConsent
// like every other capture point, so the footer, the waiver, and the booking
// checkout all write the same evidence.
//
// newsletter_subscribers is still written to. It is the table the old form
// filled for years and nothing else has been repointed at subscribers yet, so
// keeping both in step costs one insert and avoids a one-way migration.
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { recordConsent, NoContactInfoError } from "@/lib/marketing/consent";
import { FOOTER_EMAIL_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

// Email only. The footer used to carry an SMS checkbox too; that moved to the
// waiver and the booking checkout, where there is room for the full disclosure.
const schema = z
  .object({
    email: z.string().email("Valid email required"),
    // Honeypot — bots will often fill this. Should stay empty.
    company: z.string().optional(),
  })
  .strip();

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }

    // Honeypot filled — silently succeed so bots aren't tipped off.
    if (parsed.data.company) {
      return Response.json({ ok: true });
    }

    const { email } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const sb = getSupabase();
    const { error } = await sb.from("newsletter_subscribers").insert({ email: normalizedEmail });
    // Duplicate email is not an error from the caller's perspective — they're
    // already subscribed, which is the desired end state.
    if (error && error.code !== "23505") {
      return Response.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    const { ip, userAgent } = consentMetaFrom(req);

    // recordConsent is the only part of this route that needs the marketing
    // tables. If they are missing, or Supabase is briefly unavailable, a
    // visitor who just wanted the newsletter should not see a failure for
    // something they cannot act on. The waiver and booking flows already take
    // this stance through recordConsentSafe; the footer form is the last place
    // a marketing write could still turn into a 500.
    let result: Awaited<ReturnType<typeof recordConsent>> | null = null;
    try {
      result = await recordConsent({
        email: normalizedEmail,
        channels: [{ channel: "email", optIn: true }],
        source: "footer_form",
        // What the form actually said, since there is no checkbox to quote.
        consentText: FOOTER_EMAIL_CONSENT_TEXT,
        ip,
        userAgent,
      });
    } catch (err) {
      // The address already landed in newsletter_subscribers above, so the
      // person is on the list either way. A marketing table being unavailable
      // is not something they can act on.
      console.error("NEWSLETTER_CONSENT_ERROR", err);
      return Response.json({ ok: true });
    }

    if (result.applied.includes("email")) {
      await syncSubscriberToResend(result.subscriber);
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof NoContactInfoError) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("NEWSLETTER_API_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
