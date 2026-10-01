import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateRefund,
  amountDueCents,
  canPayOnline,
  duplicateBookingIds,
  isBookingEditable,
  isUnpaidReservation,
  refundDueCents,
  sameCustomer,
} from "./booking-rules.ts";

// The two real cases from the admin bookings list that prompted this: one
// person, two rows for the same visit.
test("a retyped email with the same phone is still the same customer", () => {
  assert.equal(
    sameCustomer(
      { email: "t.keoni.af@gmail.com", phone: "8017228346" },
      { email: "t.keoni.af@gmail.con", phone: "8017228346" }
    ),
    true
  );
});

test("the same email with no phone on either booking is the same customer", () => {
  assert.equal(
    sameCustomer({ email: "Jimify123@gmail.com", phone: null }, { email: "jimify123@gmail.com ", phone: null }),
    true
  );
});

test("phone formatting does not hide a match", () => {
  assert.equal(sameCustomer({ phone: "(801) 722-8346" }, { phone: "+1 801 722 8346" }), true);
});

test("different people are not matched, and blanks never match each other", () => {
  assert.equal(sameCustomer({ email: "a@example.com", phone: "8015550100" }, { email: "b@example.com", phone: "8015550199" }), false);
  assert.equal(sameCustomer({ email: "", phone: null }, { email: null, phone: "" }), false);
  // A partial number is not a number.
  assert.equal(sameCustomer({ phone: "555" }, { phone: "555" }), false);
});

test("duplicateBookingIds flags both rows of a same-day repeat and nothing else", () => {
  const ids = duplicateBookingIds([
    { id: "a", date: "2026-10-03", email: "t.keoni.af@gmail.com", phone: "8017228346" },
    { id: "b", date: "2026-10-03", email: "t.keoni.af@gmail.con", phone: "8017228346" },
    { id: "c", date: "2026-10-03", email: "someone@else.com", phone: "8015005169" },
    // Same person on a different day is a returning customer, not a duplicate.
    { id: "d", date: "2026-10-10", email: "t.keoni.af@gmail.com", phone: "8017228346" },
  ]);
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});

test("only an uncollected free or gift card reservation can be paid online", () => {
  const base = { amount_paid: 0, stripe_payment_intent_id: null };
  assert.equal(isUnpaidReservation({ ...base, payment_method: null }), true);
  assert.equal(isUnpaidReservation({ ...base, payment_method: "gift_card" }), true);
  assert.equal(isUnpaidReservation({ ...base, payment_method: "get_out_pass" }), false);
  assert.equal(isUnpaidReservation({ ...base, payment_method: "complimentary" }), false);
  assert.equal(isUnpaidReservation({ amount_paid: 3000, stripe_payment_intent_id: "pi_1", payment_method: "stripe" }), false);
});

test("amount due is the party at $15 each, less anything paid, never negative", () => {
  assert.equal(amountDueCents({ party_size: 10, amount_paid: 0 }), 15000);
  assert.equal(amountDueCents({ party_size: 4, amount_paid: 3000 }), 3000);
  assert.equal(amountDueCents({ party_size: 1, amount_paid: 3000 }), 0);
});

test("a booking is editable until its start time in Denver", () => {
  // 2026-10-01 is MDT (UTC-6), so a 5:00 PM session starts at 23:00Z.
  assert.equal(isBookingEditable("2026-10-01", "5:00 PM", new Date("2026-10-01T22:59:00Z")), true);
  assert.equal(isBookingEditable("2026-10-01", "5:00 PM", new Date("2026-10-01T23:00:00Z")), false);
  // Evening in Denver is already tomorrow in UTC. Tonight's 8:30 PM session
  // must still be editable at 7pm Denver.
  assert.equal(isBookingEditable("2026-10-01", "8:30 PM", new Date("2026-10-02T01:00:00Z")), true);
  assert.equal(isBookingEditable("2026-10-02", "11:00 AM", new Date("2026-10-01T23:30:00Z")), true);
  assert.equal(isBookingEditable("2026-09-30", "8:30 PM", new Date("2026-10-01T12:00:00Z")), false);
});

test("a balance can be paid online on an unpaid reservation or a grown card-paid party", () => {
  const unpaid = { party_size: 2, amount_paid: 0, payment_method: null, stripe_payment_intent_id: null };
  assert.equal(canPayOnline(unpaid), true);
  // Paid for 2, now 4: the difference is payable.
  assert.equal(canPayOnline({ party_size: 4, amount_paid: 3000, payment_method: "stripe", stripe_payment_intent_id: "pi_1" }), true);
  // Paid in full: nothing to pay.
  assert.equal(canPayOnline({ party_size: 2, amount_paid: 3000, payment_method: "stripe", stripe_payment_intent_id: "pi_1" }), false);
  // A Get Out Pass booking is settled in studio, never online.
  assert.equal(canPayOnline({ party_size: 2, amount_paid: 0, payment_method: "get_out_pass", stripe_payment_intent_id: null }), false);
});

test("a smaller party is owed the difference, and only what was actually paid", () => {
  assert.equal(refundDueCents({ amount_paid: 6000 }, 2), 3000);
  assert.equal(refundDueCents({ amount_paid: 6000 }, 4), 0);
  // Paid for 2, grew to 4 without paying, shrinks to 3: still owes, no refund.
  assert.equal(refundDueCents({ amount_paid: 3000 }, 3), 0);
  assert.equal(refundDueCents({ amount_paid: 0 }, 1), 0);
});

test("a refund comes off the newest payment first, then the original", () => {
  // Paid $30, later added two guests for another $30, now dropping three.
  assert.deepEqual(
    allocateRefund([{ id: "pi_extra", remaining: 3000 }, { id: "pi_first", remaining: null }], 4500),
    [{ id: "pi_extra", amount: 3000 }, { id: "pi_first", amount: 1500 }]
  );
  // A small refund never touches the original payment.
  assert.deepEqual(
    allocateRefund([{ id: "pi_extra", remaining: 3000 }, { id: "pi_first", remaining: null }], 1500),
    [{ id: "pi_extra", amount: 1500 }]
  );
  // An extra payment that was already refunded is skipped.
  assert.deepEqual(
    allocateRefund([{ id: "pi_extra", remaining: 0 }, { id: "pi_first", remaining: null }], 1500),
    [{ id: "pi_first", amount: 1500 }]
  );
});

test("a refund larger than the tracked payments is refused rather than guessed at", () => {
  assert.throws(() => allocateRefund([{ id: "pi_extra", remaining: 1500 }], 3000));
});
