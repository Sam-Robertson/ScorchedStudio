// lib/customer-notify.ts — server-only
//
// Sends the password-reset email. We never reveal whether an email has an
// account on file — the caller (app/api/account/forgot-password/route.ts)
// always responds the same way regardless of whether this actually sent
// anything, so a bad actor can't use it to enumerate customer emails.
import { Resend } from "resend";
import { signResetToken } from "@/lib/customer-session";

const resend = new Resend(process.env.RESEND_API_KEY);

// redirectTo is not part of the signed token — it only controls where the
// customer lands after setting a new password, never their identity — so
// app/account/reset-password/page.tsx is responsible for validating it's a
// safe local path before using it (no open-redirect via an attacker-supplied
// value).
export async function sendPasswordResetEmail(email: string, redirectTo?: string) {
  if (!process.env.CONTACT_FROM) {
    console.error("CUSTOMER_RESET_EMAIL_MISSING_CONTACT_FROM");
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";
  const token = signResetToken(email);
  let link = `${baseUrl}/account/reset-password?token=${encodeURIComponent(token)}`;
  if (redirectTo) link += `&redirect=${encodeURIComponent(redirectTo)}`;

  const { error } = await resend.emails.send({
    from: "Scorched Studio <accounts@scorchedstudio.com>",
    to: email,
    subject: "Reset your Scorched Studio password",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">Reset your password</h1>
        <p style="color: #555; margin-bottom: 20px;">Click below to choose a new password. This link expires in 15 minutes.</p>
        <p style="text-align: center; margin-bottom: 20px;">
          <a href="${link}" style="display: inline-block; background: #884A20; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Reset password
          </a>
        </p>
        <p style="color: #aaa; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
  if (error) console.error("CUSTOMER_RESET_EMAIL_SEND_ERROR", email, error);
}

// Sent right after sign-up so the real owner of an email notices if someone
// else registers an account against it (sign-up doesn't require email
// verification, so this is the only signal they'd get).
export async function sendAccountCreatedEmail(email: string) {
  if (!process.env.CONTACT_FROM) {
    console.error("CUSTOMER_WELCOME_EMAIL_MISSING_CONTACT_FROM");
    return;
  }

  const { error } = await resend.emails.send({
    from: "Scorched Studio <accounts@scorchedstudio.com>",
    to: email,
    subject: "Your Scorched Studio account was created",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">Account created</h1>
        <p style="color: #555; margin-bottom: 20px;">
          An account was just created at Scorched Studio using this email address.
          If that was you, no action is needed.
        </p>
        <p style="color: #555; margin-bottom: 20px;">
          If you didn't do this, someone else may have signed up with your email —
          reply to <a href="mailto:contact@scorchedstudio.com" style="color: #884A20;">contact@scorchedstudio.com</a> and we'll help sort it out.
        </p>
      </div>
    `,
  });
  if (error) console.error("CUSTOMER_WELCOME_EMAIL_SEND_ERROR", email, error);
}
