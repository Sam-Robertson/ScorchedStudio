// lib/marketing/message-rules.ts
//
// Rules every outbound marketing text has to satisfy before it leaves the
// composer. These are carrier compliance requirements, not house style: a
// marketing message that does not identify the sender or explain how to stop
// is what gets a number blocked.
import { BUSINESS_NAME } from "./consent-copy.ts";

export const STOP_NOTICE = "Reply STOP to opt out";

// A single SMS segment is 160 GSM-7 characters. Past that, carriers split the
// message and bill per part, and the parts can arrive out of order.
export const SINGLE_SEGMENT_LIMIT = 160;
// Concatenated parts carry a header, leaving 153 usable characters each.
export const CONCAT_SEGMENT_SIZE = 153;

// iMessage has no practical length limit, but we cannot know which transport a
// given recipient will get until after the send, so the counter always assumes
// the SMS fallback.
export function segmentCount(body: string): number {
  const len = body.length;
  if (len === 0) return 0;
  if (len <= SINGLE_SEGMENT_LIMIT) return 1;
  return Math.ceil(len / CONCAT_SEGMENT_SIZE);
}

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

  const segments = segmentCount(withStopNotice(trimmed));
  if (segments > 1) {
    issues.push({
      field: "body",
      level: "warning",
      message: `This is ${withStopNotice(trimmed).length} characters, which sends as ${segments} parts to anyone on SMS fallback.`,
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
