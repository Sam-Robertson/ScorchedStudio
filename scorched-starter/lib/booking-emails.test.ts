import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingUpdatedEmail, paidBookingEmail, reservationEmail } from "./booking-emails.ts";

const MANAGE_URL = "https://scorchedstudio.com/book/manage?booking_id=abc&t=tok";

const details = {
  name: "Talon Roberts",
  date: "2026-10-03",
  timeSlot: "12:00 PM",
  partySize: 10,
  locationLine: "218 E University Pkwy, Orem, UT 84058",
  manageUrl: MANAGE_URL,
};

// "&" in the link is escaped inside the href attribute.
const MANAGE_HREF = `href="${MANAGE_URL.replace(/&/g, "&amp;")}"`;

test("every booking email links to the edit page and says not to book again", () => {
  const emails = [
    reservationEmail({ ...details, paymentMethod: null }),
    reservationEmail({ ...details, paymentMethod: "gift_card" }),
    paidBookingEmail({ ...details, amountPaidCents: 15000, kind: "new_booking" }),
    paidBookingEmail({ ...details, amountPaidCents: 15000, kind: "payment_for_existing" }),
    bookingUpdatedEmail({ ...details, amountPaidCents: 0, paymentMethod: null }),
  ];
  for (const { subject, html } of emails) {
    assert.ok(html.includes(MANAGE_HREF), `${subject}: missing manage link`);
    assert.ok(html.includes("Edit your booking"), `${subject}: missing button label`);
    assert.ok(html.includes("no need to make a new one"), `${subject}: missing the do-not-rebook line`);
  }
});

test("an unpaid reservation says nothing was charged and offers to pay ahead", () => {
  const { html } = reservationEmail({ ...details, paymentMethod: null });
  assert.ok(html.includes("Nothing has been charged yet"));
  assert.ok(html.includes("$150 total"));
  assert.ok(html.includes("Pay ahead, switch to a gift card"));
});

test("a gift card reservation keeps its reminder", () => {
  const { html } = reservationEmail({ ...details, paymentMethod: "gift_card" });
  assert.ok(html.includes("Gift card reminder"));
  assert.ok(!html.includes("Nothing has been charged yet"));
});

test("a paid booking shows the total and does not offer to pay again", () => {
  const { html } = paidBookingEmail({ ...details, amountPaidCents: 15000, kind: "new_booking" });
  assert.ok(html.includes("$150.00"));
  assert.ok(!html.includes("Pay ahead"));
});

test("subjects are plain text, with no HTML entities or em dashes", () => {
  const subjects = [
    reservationEmail({ ...details, paymentMethod: null }).subject,
    paidBookingEmail({ ...details, amountPaidCents: 15000, kind: "new_booking" }).subject,
    paidBookingEmail({ ...details, amountPaidCents: 15000, kind: "payment_for_existing" }).subject,
    bookingUpdatedEmail({ ...details, amountPaidCents: 0, paymentMethod: null }).subject,
  ];
  for (const subject of subjects) {
    // The paid confirmation used to go out with a literal "&apos;" in it.
    assert.ok(!/&[a-z]+;/.test(subject), subject);
    assert.ok(!subject.includes("—"), subject);
  }
});

test("a name cannot inject markup into the email", () => {
  const { html } = reservationEmail({ ...details, name: "<img src=x> Smith", paymentMethod: null });
  assert.ok(!html.includes("<img src=x>"));
  assert.ok(html.includes("&lt;img"));
});

test("a smaller paid party is told about its refund", () => {
  const { html } = bookingUpdatedEmail({ ...details, partySize: 8, amountPaidCents: 12000, paymentMethod: "stripe", refundedCents: 3000 });
  assert.ok(html.includes("Refund on its way"));
  assert.ok(html.includes("$30.00"));
  assert.ok(html.includes("$120.00"), "total paid should be what is left after the refund");
});

test("a bigger paid party is told what is still due", () => {
  const { html } = bookingUpdatedEmail({ ...details, partySize: 12, amountPaidCents: 15000, paymentMethod: "stripe" });
  assert.ok(html.includes("$30.00 still due"));
  assert.ok(html.includes("Pay the balance"));
  assert.ok(!html.includes("Refund on its way"));
});
