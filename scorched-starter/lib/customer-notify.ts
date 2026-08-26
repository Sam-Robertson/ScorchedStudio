// lib/customer-notify.ts — server-only
//
// Sends the magic-link login email. We never reveal whether an email has
// any bookings/memberships/enrollments on file — the link is sent
// unconditionally for any syntactically valid email, same as password-reset
// flows avoid confirming account existence. An email with nothing on file
// just lands on an empty dashboard; that's harmless.
import { Resend } from "resend";
import { signLoginToken } from "@/lib/customer-session";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendLoginEmail(email: string) {
  if (!process.env.CONTACT_FROM) {
    console.error("CUSTOMER_LOGIN_EMAIL_MISSING_CONTACT_FROM");
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";
  const token = signLoginToken(email);
  const link = `${baseUrl}/api/account/verify?token=${encodeURIComponent(token)}`;

  const { error } = await resend.emails.send({
    from: "Scorched Studio <accounts@scorchedstudio.com>",
    to: email,
    subject: "Log in to your Scorched Studio account",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">Log in to Scorched Studio</h1>
        <p style="color: #555; margin-bottom: 20px;">Click below to log in. This link expires in 15 minutes.</p>
        <p style="text-align: center; margin-bottom: 20px;">
          <a href="${link}" style="display: inline-block; background: #884A20; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Log in
          </a>
        </p>
        <p style="color: #aaa; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
  if (error) console.error("CUSTOMER_LOGIN_EMAIL_SEND_ERROR", email, error);
}
