// lib/marketing/message-rules.ts
//
// Rules every outbound marketing text has to satisfy before it leaves the
// composer. These are carrier compliance requirements, not house style: a
// marketing message that does not identify the sender or explain how to stop
// is what gets a number blocked.
import { BUSINESS_NAME } from "./consent-copy.ts";
import { analyzeSms, segmentCount } from "./sms-segments.ts";

export { segmentCount };

export const STOP_NOTICE = "Reply STOP to opt out";

// Segment counting lives in sms-segments.ts, which classifies the encoding
// first. The naive version here counted characters and assumed 160/153, which
// is wrong for any message containing an emoji (UCS-2 drops the limit to 70)
// or one of the nine GSM-7 extended characters (each costs two septets).

// Case-insensitive and tolerant of the variants an author might type, so the
// composer does not append a second notice to a message that already has one.
export function hasStopNotice(body: string): boolean {
  return /\b(reply\s+)?stop\b[^.]*\b(opt\s*out|unsubscribe|end|cancel)\b/i.test(body)
    || /\breply\s+stop\b/i.test(body);
}

export function hasBusinessName(body: string, name: string = BUSINESS_NAME): boolean {
  return body.toLowerCase().includes(name.toLowerCase());
}

export type MessageIssue = {
  field: "body";
  level: "error" | "warning";
  message: string;
};

// Errors block the send; warnings are shown but do not.
export function validateSmsBody(body: string, name: string = BUSINESS_NAME): MessageIssue[] {
  const issues: MessageIssue[] = [];
  const trimmed = body.trim();

  if (!trimmed) {
    issues.push({ field: "body", level: "error", message: "Message body is empty." });
    return issues;
  }

  if (!hasBusinessName(trimmed, name)) {
    issues.push({
      field: "body",
      level: "error",
      message: `Every marketing text has to name the business. Include "${name}" in the message.`,
    });
  }

  const final = withStopNotice(trimmed);
  const info = analyzeSms(final);

  if (info.encoding === "UCS-2") {
    issues.push({
      field: "body",
      level: "warning",
      message:
        `${info.forcedUcs2By.slice(0, 5).join(" ")} cannot be sent as plain GSM-7, so the whole message ` +
        `switches to UCS-2 and the limit drops from 160 characters to 70. Removing it would cut the cost.`,
    });
  } else if (info.doubleWidth.length > 0) {
    issues.push({
      field: "body",
      level: "warning",
      message: `${info.doubleWidth.join(" ")} each count as two characters toward the 160 limit.`,
    });
  }

  if (info.segments > 1) {
    issues.push({
      field: "body",
      level: "warning",
      message:
        `This is ${info.units} characters once the opt-out notice is added, so it sends as ` +
        `${info.segments} segments and bills ${info.segments} times per recipient.`,
    });
  }

  return issues;
}

// Appends the opt-out notice unless the author already wrote one. Applied at
// send time as well as in the composer, so a campaign created through the API
// cannot skip it.
export function withStopNotice(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  if (hasStopNotice(trimmed)) return trimmed;
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${STOP_NOTICE}`;
}
