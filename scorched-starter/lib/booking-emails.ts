// lib/booking-emails.ts
//
// The emails a booking sends, as pure builders that return a subject and an
// HTML body. They used to be inline template strings in three routes, which is
// how the wording drifted between the paid and the free confirmation. No "@/"
// imports, so the test runner and scripts/send-test-booking-email.ts can both
// use exactly what the routes send.
import { PRICE_PER_PERSON } from "./booking-rules.ts";

export const BOOKING_EMAIL_FROM = "Scorched Studio <bookings@scorchedstudio.com>";

export type BookingEmail = { subject: string; html: string };

export type BookingEmailDetails = {
  name: string;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  partySize: number;
  // Address when there is one, otherwise the location name.
  locationLine: string;
  manageUrl: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(name: string): string {
  return esc(name.trim().split(/\s+/)[0] || "there");
}

function formatDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function people(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

function detailsTable(rows: Array<[label: string, value: string]>): string {
  const body = rows
    .map(([label, value], i) => {
      const border = i === rows.length - 1 ? "" : " border-bottom: 1px solid #eee;";
      return `
          <tr>
            <td style="padding: 8px 0;${border} color: #888; font-size: 13px; width: 40%;">${label}</td>
            <td style="padding: 8px 0;${border} font-size: 13px;">${value}</td>
          </tr>`;
    })
    .join("");
  return `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">${body}
        </table>`;
}

function bookingRows(d: BookingEmailDetails, extra: Array<[string, string]> = []): Array<[string, string]> {
  return [
    ["Date", formatDate(d.date)],
    ["Time", esc(d.timeSlot)],
    ["Party size", people(d.partySize)],
    ...extra,
    ["Location", esc(d.locationLine)],
  ];
}

function noteBox(html: string, tone: "plain" | "highlight" = "plain"): string {
  const [bg, color] = tone === "highlight" ? ["#FEF9C3", "#713F12"] : ["#F7F6F3", "#555"];
  return `<div style="background: ${bg}; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
          <p style="font-size: 13px; color: ${color}; margin: 0;">${html}</p>
        </div>`;
}

// The one place a customer is told how to change a booking. It says outright
// that they do not need a second booking, because making one is exactly what
// people did when the old link only mentioned rescheduling and cancelling.
function manageBlock(manageUrl: string, canDo: string): string {
  return `<div style="border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
          <p style="font-size: 14px; font-weight: bold; color: #3A3A3A; margin: 0 0 6px;">Need to change something?</p>
          <p style="font-size: 13px; color: #555; margin: 0 0 14px;">
            ${canDo} It all happens on this booking, so there is no need to make a new one.
          </p>
          <a href="${esc(manageUrl)}" style="display: inline-block; background: #884A20; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: bold; padding: 10px 18px; border-radius: 8px;">Edit your booking</a>
        </div>`;
}

const WAIVER_NOTE = noteBox(
  `<strong>Reminder:</strong> Each person needs to sign a waiver before their first visit.
            Sign at <a href="https://scorchedstudio.com/waiver" style="color: #884A20;">scorchedstudio.com/waiver</a> or in-studio.`
);

function shell(inner: string): string {
  return `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        ${inner}
        <p style="color: #555; font-size: 14px; margin-top: 12px;">
          Questions? Email <a href="mailto:contact@scorchedstudio.com" style="color: #884A20;">contact@scorchedstudio.com</a>
          or call <a href="tel:+18013619066" style="color: #884A20;">(801) 361-9066</a>.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 12px;">Please do not reply to this email. This inbox is not monitored.</p>
        <p style="color: #555; font-size: 14px; margin-top: 24px;">
          See you soon!<br/><strong>The Scorched Studio Team</strong>
        </p>
      </div>
    `;
}

function unpaidNote(partySize: number, paymentMethod: "gift_card" | null): string {
  if (paymentMethod === "gift_card") {
    return noteBox(
      `<strong>Gift card reminder:</strong> Please bring your gift card to pay the $${PRICE_PER_PERSON} per-person studio fee in-studio when you arrive.`,
      "highlight"
    );
  }
  return noteBox(
    `<strong>Nothing has been charged yet.</strong> The $${PRICE_PER_PERSON} per-person studio fee ($${PRICE_PER_PERSON * partySize} total) is due when you arrive. Want to pay ahead or use a gift card? Use the button below.`,
    "highlight"
  );
}

const UNPAID_CAN_DO = "Pay ahead, switch to a gift card, change your time or party size, or cancel.";
const PAID_CAN_DO = "Change your time or party size, or cancel.";
const BALANCE_CAN_DO = "Pay the balance, change your time or party size, or cancel.";

// Sent when someone reserves without paying (the free and gift card paths).
export function reservationEmail(d: BookingEmailDetails & { paymentMethod: "gift_card" | null }): BookingEmail {
  return {
    subject: "Your Scorched Studio reservation: you're all set!",
    html: shell(`
        <h1 style="font-size: 22px; margin-bottom: 8px;">You're reserved, ${firstName(d.name)}!</h1>
        <p style="color: #555; margin-bottom: 24px;">
          Your spot is held at Scorched Studio. Here are your reservation details:
        </p>
        ${detailsTable(bookingRows(d))}
        ${unpaidNote(d.partySize, d.paymentMethod)}
        ${manageBlock(d.manageUrl, UNPAID_CAN_DO)}
        ${WAIVER_NOTE}`),
  };
}

// Sent when a card payment lands: either a brand new paid booking, or someone
// paying for a reservation they made earlier.
export function paidBookingEmail(
  d: BookingEmailDetails & { amountPaidCents: number; kind: "new_booking" | "payment_for_existing" }
): BookingEmail {
  const isNew = d.kind === "new_booking";
  return {
    subject: isNew
      ? "Your Scorched Studio booking: you're all set!"
      : "Payment received for your Scorched Studio booking",
    html: shell(`
        <h1 style="font-size: 22px; margin-bottom: 8px;">${isNew ? "You're booked" : "You're all paid up"}, ${firstName(d.name)}!</h1>
        <p style="color: #555; margin-bottom: 24px;">
          ${
            isNew
              ? "We can't wait to see you at Scorched Studio. Here are your booking details:"
              : "We received your payment for the booking below. Nothing more is due in studio."
          }
        </p>
        ${detailsTable(bookingRows(d, [["Total paid", dollars(d.amountPaidCents)]]))}
        ${manageBlock(d.manageUrl, PAID_CAN_DO)}
        ${WAIVER_NOTE}`),
  };
}

// Sent after a customer edits a booking. Shows the booking as it now stands,
// and says so when the change moved money: a refund for a smaller party, or a
// balance for a bigger one.
export function bookingUpdatedEmail(
  d: BookingEmailDetails & { amountPaidCents: number; paymentMethod: string | null; refundedCents?: number }
): BookingEmail {
  const paid = d.amountPaidCents > 0;
  const unpaid = !paid && (d.paymentMethod === null || d.paymentMethod === "gift_card");
  const dueCents = paid ? Math.max(0, d.partySize * PRICE_PER_PERSON * 100 - d.amountPaidCents) : 0;
  const refunded = d.refundedCents ?? 0;

  const moneyNote =
    refunded > 0
      ? noteBox(
          `<strong>Refund on its way:</strong> ${dollars(refunded)} is going back to your original payment method for the smaller party. It usually appears within 5 to 10 business days.`,
          "highlight"
        )
      : dueCents > 0
      ? noteBox(
          `<strong>${dollars(dueCents)} still due</strong> for the guests you added. Pay it from your booking with the button below, or in studio when you arrive.`,
          "highlight"
        )
      : "";

  return {
    subject: "Your Scorched Studio booking has been updated",
    html: shell(`
        <h1 style="font-size: 22px; margin-bottom: 8px;">Booking updated, ${firstName(d.name)}!</h1>
        <p style="color: #555; margin-bottom: 24px;">Here are your updated booking details:</p>
        ${detailsTable(bookingRows(d, paid ? [["Total paid", dollars(d.amountPaidCents)]] : []))}
        ${moneyNote}
        ${unpaid ? unpaidNote(d.partySize, d.paymentMethod === "gift_card" ? "gift_card" : null) : ""}
        ${manageBlock(d.manageUrl, unpaid ? UNPAID_CAN_DO : dueCents > 0 ? BALANCE_CAN_DO : PAID_CAN_DO)}`),
  };
}
