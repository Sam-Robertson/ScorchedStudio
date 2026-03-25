// lib/booking-utils.ts

// Slots every 30 min; last slot at 8:30 PM ends at 10:00 PM
export const WEEKDAY_SLOTS = [
  "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM",
  "7:00 PM", "7:30 PM",
  "8:00 PM", "8:30 PM",
] as const;

export const SATURDAY_SLOTS = [
  "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM",
  "1:00 PM",  "1:30 PM",
  "2:00 PM",  "2:30 PM",
  "3:00 PM",  "3:30 PM",
  "4:00 PM",  "4:30 PM",
  "5:00 PM",  "5:30 PM",
  "6:00 PM",  "6:30 PM",
  "7:00 PM",  "7:30 PM",
  "8:00 PM",  "8:30 PM",
] as const;

export const MAX_CAPACITY = 20;
export const MAX_PARTY_SIZE = 15;
export const PRICE_PER_PERSON = 15;
export const PRICE_PER_PERSON_CENTS = 1500;

export function getSlotsForDate(dateStr: string): string[] {
  // Use noon local time to avoid timezone edge cases
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  if (day === 0) return [];
  if (day === 6) return [...SATURDAY_SLOTS];
  return [...WEEKDAY_SLOTS];
}
