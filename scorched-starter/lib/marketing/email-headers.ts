// lib/marketing/email-headers.ts
//
// Split out of email-send.ts so the project's test runner can reach it:
// email-send.ts imports the markdown pipeline and React Email through the "@/"
// alias, which plain node --test does not resolve.
import { siteUrl } from "./config.ts";

export function unsubscribeUrlFor(token: string): string {
  return `${siteUrl()}/unsubscribe/${token}`;
}

// RFC 8058 one-click unsubscribe. Gmail and Yahoo require these on bulk mail,
// and without them a marketing send lands in spam far more often. The POST
// variant is what a mail client calls when someone uses the unsubscribe button
// in the client's own chrome rather than the link in the message body.
export function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrlFor(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
