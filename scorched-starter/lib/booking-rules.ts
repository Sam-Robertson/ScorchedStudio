// lib/booking-rules.ts
//
// Booking rules that the server, the browser, and the tests all need to agree
// on: what a session costs, when a booking is still editable, whether it can
// be paid online, and when two bookings look like the same party booked twice.
// Pure functions with no "@/" imports, so client components can import it and
// the project's test runner can drive it.
import { denverDayRangeUTC, todayInDenverYmd } from "./timezone.ts";

export const MAX_PARTY_SIZE = 15;
export const PRICE_PER_PERSON = 15;
export const PRICE_PER_PERSON_CENTS = 1500;

// True until the session's start time in Denver. Offsets from the day's real
// Denver midnight rather than a hardcoded UTC-7, which is an hour off for the
// seven months the studio is on MDT.
export function isBookingEditable(bookingDate: string, timeSlot: string, now: Date = new Date()): boolean {
  const todayDenver = todayInDenverYmd(now);

  if (bookingDate > todayDenver) return true;
  if (bookingDate < todayDenver) return false;

  const match = timeSlot.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return false;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  const dayStartUTC = new Date(denverDayRangeUTC(bookingDate).startUTC);
  const slotUTC = new Date(dayStartUTC.getTime() + (hours * 60 + minutes) * 60_000);

  return now < slotUTC;
}

type PaymentState = {
  amount_paid: number;
  payment_method: string | null;
  stripe_payment_intent_id?: string | null;
};

// A free reservation that nothing has been collected for yet: no card payment,
// and not a Get Out Pass or complimentary booking an admin set up. These are
// the bookings a customer may pay for online or flip to and from gift card.
export function isUnpaidReservation(b: PaymentState): boolean {
  return (
    b.amount_paid === 0 &&
    !b.stripe_payment_intent_id &&
    (b.payment_method === null || b.payment_method === "gift_card")
  );
}

export function amountDueCents(b: { party_size: number; amount_paid: number }): number {
  return Math.max(0, b.party_size * PRICE_PER_PERSON_CENTS - b.amount_paid);
}

// A balance can be paid online on a reservation nothing has been collected
// for, and on a card-paid booking whose party has grown since it was paid.
export function canPayOnline(b: PaymentState & { party_size: number }): boolean {
  return amountDueCents(b) > 0 && (isUnpaidReservation(b) || b.payment_method === "stripe");
}

// What a card-paid booking gets back when its party shrinks to `newPartySize`.
export function refundDueCents(b: { amount_paid: number }, newPartySize: number): number {
  return Math.max(0, b.amount_paid - newPartySize * PRICE_PER_PERSON_CENTS);
}

// Splits a refund across a booking's card payments, taking from each in the
// order given until the amount is covered. `remaining: null` marks a payment
// whose refundable balance is not tracked here (the booking's first payment):
// it takes whatever is left, and Stripe is the one that enforces its limit.
export function allocateRefund(
  payments: Array<{ id: string; remaining: number | null }>,
  cents: number
): Array<{ id: string; amount: number }> {
  const plan: Array<{ id: string; amount: number }> = [];
  let left = cents;
  for (const payment of payments) {
    if (left <= 0) break;
    const amount = payment.remaining === null ? left : Math.min(left, payment.remaining);
    if (amount <= 0) continue;
    plan.push({ id: payment.id, amount });
    left -= amount;
  }
  if (left > 0) throw new Error(`Refund of ${cents} cents exceeds what was paid by ${left} cents`);
  return plan;
}

// ── Same party booked twice ─────────────────────────────────────────────────
//
// People come back to pay, or to say they have a gift card, and make a second
// booking instead of changing the first. The second one doubles their party in
// the capacity count and leaves staff guessing which row is real.

type Contact = { email?: string | null; phone?: string | null };

function emailKey(email: string | null | undefined): string | null {
  const key = (email ?? "").trim().toLowerCase();
  return key || null;
}

// Last ten digits, so "(801) 555-0100", "8015550100" and "+18015550100" all
// compare equal. Anything shorter is not a full number and never matches.
function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// Email OR phone, not both. The repeat booking is often typed in a hurry, and
// a mistyped email ("gmail.con") with the same phone is still the same person.
export function sameCustomer(a: Contact, b: Contact): boolean {
  const emailA = emailKey(a.email);
  if (emailA && emailA === emailKey(b.email)) return true;
  const phoneA = phoneKey(a.phone);
  return phoneA !== null && phoneA === phoneKey(b.phone);
}

// Ids of every booking that shares a date and a customer with another booking
// in the list. Callers pass confirmed bookings only.
export function duplicateBookingIds<T extends Contact & { id: string; date: string }>(bookings: T[]): Set<string> {
  const byDate = new Map<string, T[]>();
  for (const b of bookings) {
    const day = byDate.get(b.date);
    if (day) day.push(b);
    else byDate.set(b.date, [b]);
  }

  const ids = new Set<string>();
  for (const day of byDate.values()) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        if (sameCustomer(day[i], day[j])) {
          ids.add(day[i].id);
          ids.add(day[j].id);
        }
      }
    }
  }
  return ids;
}
