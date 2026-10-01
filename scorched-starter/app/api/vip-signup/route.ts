// app/api/vip-signup/route.ts
//
// The Scorched VIP sign-up form on /scorched-vip. It replaced a QR code and a
// "text BURN" keyword that both pointed at a vendor we no longer use.
//
// Unlike the waiver and the booking checkout, joining the list is the whole
// point of this form, so it calls recordConsent directly rather than
// recordConsentSafe: if the opt-in was not recorded, the visitor has to be told
// rather than shown a success for a sign-up that went nowhere.
import { z } from "zod";
import { recordConsent } from "@/lib/marketing/consent";
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { normalizePhone } from "@/lib/marketing/phone";
import { consentMetaFrom } from "@/lib/marketing/request-meta";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

const schema = z
  .object({
    firstName: z.string().trim().max(80).optional(),
    email: z.string().trim().email(),
    phone: z.string().max(40).optional(),
    emailOptIn: z.boolean().optional().default(false),
    smsOptIn: z.boolean().optional().default(false),
    // Honeypot, same as the footer form. Should stay empty.
    company: z.string().optional(),
  })
  .strip();

function invalid(error: string) {
  return Response.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((issue) => issue.path[0] === "email");
    return invalid(emailIssue ? "Enter a valid email address." : "Invalid input");
  }

  // Honeypot filled: succeed silently so bots are not tipped off.
  if (parsed.data.company) {
    return Response.json({ ok: true });
  }

  const { firstName, email, emailOptIn, smsOptIn } = parsed.data;

  // Both boxes start unticked, and with neither ticked there is nothing this
  // person has agreed to receive.
  if (!emailOptIn && !smsOptIn) {
    return invalid("Tick at least one box so we know how to reach you.");
  }

  // recordConsent quietly drops a number it cannot normalize, which would
  // leave the text opt-in unrecorded behind a success message. Checked here so
  // the visitor can fix it instead.
  let phone: string | null = null;
  if (smsOptIn) {
    if (!parsed.data.phone?.trim()) {
      return invalid("Add a mobile number so we know where to text you.");
    }
    phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return invalid("That does not look like a mobile number we can text.");
    }
  }

  try {
    const { ip, userAgent } = consentMetaFrom(req);
    const result = await recordConsent({
      email,
      // Only sent when opting in to texts, so a number typed next to an
      // unticked box is never attached to the record.
      phone,
      firstName: firstName || null,
      channels: [
        ...(emailOptIn ? [{ channel: "email" as const, optIn: true }] : []),
        ...(smsOptIn ? [{ channel: "sms" as const, optIn: true }] : []),
      ],
      source: "vip_signup",
      consentText: [emailOptIn ? EMAIL_CONSENT_TEXT : null, smsOptIn ? SMS_CONSENT_TEXT : null]
        .filter(Boolean)
        .join(" "),
      ip,
      userAgent,
      tags: ["vip"],
    });

    if (result.applied.includes("email")) {
      await syncSubscriberToResend(result.subscriber);
    }

    return Response.json({ ok: true });
  } catch (err) {
    // Includes the consent log rejecting 'vip_signup' because
    // supabase-marketing-vip-source.sql has not been run. recordConsent writes
    // the subscriber row before the consent rows, so a failure at that point
    // leaves the row behind marked subscribed with no consent event. Logged
    // with the address so it can be found.
    console.error("VIP_SIGNUP_ERROR", { email, err });
    return Response.json(
      { error: "We could not sign you up just now. Please try again in a little while." },
      { status: 500 }
    );
  }
}
