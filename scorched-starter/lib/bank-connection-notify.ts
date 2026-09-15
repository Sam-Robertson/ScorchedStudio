// lib/bank-connection-notify.ts (server-only)
//
// Emails staff when a Plaid bank connection needs someone to log in again.
// The nightly sync skips that bank until it is reconnected, so without this
// its transactions would stop arriving with nothing to show for it.
import { Resend } from "resend";

const RECIPIENTS = ["sam@scorchedstudio.com"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Called from the plaid-sync cron. Never throws, so a failed email can't stop
// the rest of that night's sync or revenue posting.
export async function notifyBankNeedsLogin(institutionName: string) {
  try {
    if (!process.env.CONTACT_FROM) {
      console.error("BANK_CONNECTION_NOTIFY_MISSING_CONTACT_FROM");
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const name = escapeHtml(institutionName);
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
        <p style="font-size: 14px; margin-bottom: 12px;">
          <strong>${name}</strong> needs you to log in again before it can keep syncing.
        </p>
        <p style="font-size: 14px; color: #555; margin-bottom: 20px;">
          Until then, no new ${name} transactions reach the books. Other banks and daily revenue keep posting as usual.
          Open Accounting, go to the Bank Accounts tab, and click Reconnect. Anything missed syncs the next night.
        </p>
        <a href="https://scorchedstudio.com/admin/accounting" style="font-size: 13px; color: #884A20;">Open Accounting</a>
      </div>
    `;

    // resend.emails.send() resolves with { data, error } instead of throwing
    // on API-level failures (bad recipient, unverified domain, etc.), so each
    // send's error must be checked explicitly or a failure would go silent.
    await Promise.all(
      RECIPIENTS.map(async (to) => {
        const { error } = await resend.emails.send({
          from: process.env.CONTACT_FROM!,
          to,
          subject: `${institutionName} needs you to log in again`,
          html,
        });
        if (error) console.error("BANK_CONNECTION_NOTIFY_SEND_ERROR", to, error);
      })
    );
  } catch (err) {
    console.error("BANK_CONNECTION_NOTIFY_ERROR", institutionName, err);
  }
}
