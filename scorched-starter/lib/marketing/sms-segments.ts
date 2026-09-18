// lib/marketing/sms-segments.ts
//
// How many SMS segments a message actually costs, and therefore what it costs
// in money.
//
// The naive version of this ("length <= 160 means one segment") is wrong in two
// ways that both bite in practice:
//
//   1. Nine characters in the GSM-7 alphabet (^ { } [ ] ~ \ | and the euro
//      sign) are encoded as an escape plus a character, so they take TWO
//      septets each. A 159 character message with one euro sign is two
//      segments.
//   2. A single character outside GSM-7, most commonly an emoji or a curly
//      apostrophe pasted from a word processor, forces the ENTIRE message into
//      UCS-2, where the limit collapses from 160 to 70.
//
// So the order is: classify the encoding first, then count units. Never count
// characters and branch afterwards.

// GSM 03.38 basic character set. The escape character itself (0x1B) is
// deliberately absent: it is not something a person types.
const GSM7_BASIC = new Set(
  (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
    "¿abcdefghijklmnopqrstuvwxyzäöñüà"
  ).split("")
);

// Each of these costs two septets, because it is sent as escape + character.
const GSM7_EXTENDED = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€", "\f"]);

export const GSM7_SINGLE = 160;
export const GSM7_CONCAT = 153; // the rest carries the multi-part header
export const UCS2_SINGLE = 70;
export const UCS2_CONCAT = 67;

export type SmsEncoding = "GSM-7" | "UCS-2";

export type SegmentInfo = {
  encoding: SmsEncoding;
  // Septets for GSM-7, UTF-16 code units for UCS-2. This is the number the
  // limits below actually apply to, which is not the same as body.length.
  units: number;
  segments: number;
  // Characters that forced UCS-2, so the composer can say which ones to remove.
  forcedUcs2By: string[];
  // Characters that silently cost double in GSM-7.
  doubleWidth: string[];
};

// Iterates by code point rather than by UTF-16 code unit, so an emoji outside
// the BMP is examined as one character instead of two orphaned surrogates.
export function analyzeSms(body: string): SegmentInfo {
  const forcedUcs2By: string[] = [];
  const doubleWidth: string[] = [];
  let septets = 0;

  for (const char of body) {
    if (GSM7_BASIC.has(char)) {
      septets += 1;
    } else if (GSM7_EXTENDED.has(char)) {
      septets += 2;
      if (!doubleWidth.includes(char)) doubleWidth.push(char);
    } else if (!forcedUcs2By.includes(char)) {
      forcedUcs2By.push(char);
    }
  }

  if (forcedUcs2By.length > 0) {
    // UCS-2 limits are counted in 16-bit units, which is exactly what
    // String.length gives: a non-BMP emoji is two units and does cost two.
    const units = body.length;
    const segments =
      units === 0 ? 0 : units <= UCS2_SINGLE ? 1 : Math.ceil(units / UCS2_CONCAT);
    return { encoding: "UCS-2", units, segments, forcedUcs2By, doubleWidth };
  }

  const segments =
    septets === 0 ? 0 : septets <= GSM7_SINGLE ? 1 : Math.ceil(septets / GSM7_CONCAT);
  return { encoding: "GSM-7", units: septets, segments, forcedUcs2By, doubleWidth };
}

export function segmentCount(body: string): number {
  return analyzeSms(body).segments;
}

// Per-recipient cost of one send. Carriers bill per segment per recipient, so
// a two segment message to 500 people is 1,000 billable segments.
export function estimateCost(body: string, costPerSegment: number, recipients = 1): number {
  return analyzeSms(body).segments * costPerSegment * recipients;
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type SmsCostEstimate = {
  encoding: SmsEncoding;
  segments: number;
  units: number;
  recipients: number;
  perMessage: number;
  total: number;
  forcedUcs2By: string[];
  doubleWidth: string[];
};

export function costEstimate(
  body: string,
  costPerSegment: number,
  recipients: number
): SmsCostEstimate {
  const info = analyzeSms(body);
  return {
    encoding: info.encoding,
    segments: info.segments,
    units: info.units,
    recipients,
    perMessage: info.segments * costPerSegment,
    total: info.segments * costPerSegment * recipients,
    forcedUcs2By: info.forcedUcs2By,
    doubleWidth: info.doubleWidth,
  };
}
