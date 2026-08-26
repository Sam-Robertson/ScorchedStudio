// lib/equipment-report-notify.ts — server-only
//
// Emails Sam and Pearson when a new equipment/inventory request is submitted
// from the admin Requests page.
import { Resend } from "resend";

const RECIPIENTS = ["sam@scorchedstudio.com", "pearsontbrown1@gmail.com"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function notifyNewEquipmentReport(params: {
  category: string;
  priority: string | null;
  notes: string;
  location: string;
}) {
  if (!process.env.CONTACT_FROM) {
    console.error("EQUIPMENT_REPORT_NOTIFY_MISSING_CONTACT_FROM");
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const locationLabel = params.location.charAt(0).toUpperCase() + params.location.slice(1);
  const priorityLabel = params.priority ?? "Not set";

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
      <p style="font-size: 14px; margin-bottom: 4px;">
        New request submitted at <strong>${escapeHtml(locationLabel)}</strong>
      </p>
      <p style="font-size: 12px; color: #888; margin-bottom: 16px;">
        ${escapeHtml(params.category)} &middot; Priority: ${escapeHtml(priorityLabel)}
      </p>
      <div style="background: #f7f6f3; border-radius: 10px; padding: 14px 16px; font-size: 14px; white-space: pre-wrap; margin-bottom: 20px;">${escapeHtml(params.notes)}</div>
      <a href="https://scorchedstudio.com/admin/requests" style="font-size: 13px; color: #884A20;">View on Requests</a>
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
        subject: `New request: ${params.category} (${locationLabel})`,
        html,
      });
      if (error) console.error("EQUIPMENT_REPORT_NOTIFY_SEND_ERROR", to, error);
    })
  );
}
