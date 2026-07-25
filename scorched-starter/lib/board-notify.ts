// lib/board-notify.ts — server-only
//
// Emails the other participant(s) on a board when someone leaves a comment.
// The comment's author is never notified about their own comment.
import { Resend } from "resend";

export type Board = "operations" | "social";

const BOARD_PARTICIPANTS: Record<Board, { name: string; email: string }[]> = {
  operations: [
    { name: "Sam Robertson", email: "sam@scorchedstudio.com" },
    { name: "Pearson Brown", email: "pearsontbrown1@gmail.com" },
  ],
  social: [
    { name: "Sam Robertson", email: "sam@scorchedstudio.com" },
    { name: "Jess", email: "contact@jessicagurney.com" },
  ],
};

const BOARD_LABEL: Record<Board, string> = {
  operations: "Operations Board",
  social: "Social Media Board",
};

const BOARD_URL: Record<Board, string> = {
  operations: "https://scorchedstudio.com/admin/projects",
  social: "https://scorchedstudio.com/admin/social",
};

export async function notifyNewComment(params: {
  board: Board;
  entityTitle: string;
  author: string;
  body: string;
}) {
  const recipients = BOARD_PARTICIPANTS[params.board].filter((p) => p.name !== params.author);
  if (recipients.length === 0) return;

  if (!process.env.CONTACT_FROM) {
    console.error("BOARD_NOTIFY_MISSING_CONTACT_FROM");
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const label = BOARD_LABEL[params.board];
  const url = BOARD_URL[params.board];

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
      <p style="font-size: 14px; margin-bottom: 4px;">
        <strong>${params.author}</strong> commented on <strong>${params.entityTitle}</strong>
      </p>
      <p style="font-size: 12px; color: #888; margin-bottom: 16px;">${label}</p>
      <div style="background: #f7f6f3; border-radius: 10px; padding: 14px 16px; font-size: 14px; white-space: pre-wrap; margin-bottom: 20px;">${params.body}</div>
      <a href="${url}" style="font-size: 13px; color: #884A20;">View on ${label}</a>
    </div>
  `;

  // resend.emails.send() resolves with { data, error } instead of throwing
  // on API-level failures (bad recipient, unverified domain, etc.), so each
  // send's error must be checked explicitly or a failure would go silent.
  await Promise.all(
    recipients.map(async (r) => {
      const { error } = await resend.emails.send({
        from: process.env.CONTACT_FROM!,
        to: r.email,
        subject: `${params.author} commented on ${params.entityTitle}`,
        html,
      });
      if (error) console.error("BOARD_NOTIFY_SEND_ERROR", r.email, error);
    })
  );
}
