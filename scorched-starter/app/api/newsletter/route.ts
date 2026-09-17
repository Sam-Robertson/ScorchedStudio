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
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

const schema = z
  .object({
    email: z.string().email("Valid email required"),
    phone: z.string().optional(),
    emailOptIn: z.boolean().optional().default(false),
    smsOptIn: z.boolean().optional().default(false),
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

    const { email, phone, emailOptIn, smsOptIn } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    if (!emailOptIn && !smsOptIn) {
      return Response.json(
        { error: "Choose at least one way for us to reach you." },
        { status: 400 }
      );
    }

    const sb = getSupabase();
    const { error } = await sb.from("newsletter_subscribers").insert({ email: normalizedEmail });
    // Duplicate email is not an error from the caller's perspective — they're
    // already subscribed, which is the desired end state.
    if (error && error.code !== "23505") {
      return Response.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    const { ip, userAgent } = consentMetaFrom(req);

    // The consent text stored is only the wording for the boxes actually
    // ticked, so the log never claims someone read an SMS disclosure they
    // never saw.
    const consentText = [
      emailOptIn ? EMAIL_CONSENT_TEXT : null,
      smsOptIn ? SMS_CONSENT_TEXT : null,
    ]
      .filter(Boolean)
      .join(" ");

    const result = await recordConsent({
      email: normalizedEmail,
      phone: smsOptIn ? phone : null,
      channels: [
        ...(emailOptIn ? [{ channel: "email" as const, optIn: true }] : []),
        ...(smsOptIn ? [{ channel: "sms" as const, optIn: true }] : []),
      ],
      source: "footer_form",
      consentText,
      ip,
      userAgent,
    });

    if (result.applied.includes("email")) {
      await syncSubscriberToResend(result.subscriber);
    }

    // smsOptIn with a number we could not normalize is the one case worth
    // telling the visitor about, since they will otherwise never hear from us.
    const smsRequestedButUnusable = smsOptIn && !result.subscriber.phone;

    return Response.json({ ok: true, smsSkipped: smsRequestedButUnusable });
  } catch (err) {
    if (err instanceof NoContactInfoError) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("NEWSLETTER_API_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
