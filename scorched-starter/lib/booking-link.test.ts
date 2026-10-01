import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canManageBooking,
  manageBookingPath,
  manageBookingUrl,
  signBookingToken,
  verifyBookingToken,
} from "./booking-link.ts";

const ID = "c71e6329-6338-4d37-8a37-5c0656808500";
const OTHER_ID = "11111111-2222-4333-8444-555555555555";

function withSecret<T>(secret: string | undefined, run: () => T): T {
  const before = process.env.CUSTOMER_SESSION_SECRET;
  if (secret === undefined) delete process.env.CUSTOMER_SESSION_SECRET;
  else process.env.CUSTOMER_SESSION_SECRET = secret;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.CUSTOMER_SESSION_SECRET;
    else process.env.CUSTOMER_SESSION_SECRET = before;
  }
}

test("a booking's token opens that booking and no other", () => {
  withSecret("test-secret", () => {
    const token = signBookingToken(ID);
    assert.ok(token);
    assert.equal(verifyBookingToken(ID, token), true);
    assert.equal(verifyBookingToken(OTHER_ID, token), false);
    assert.equal(verifyBookingToken(ID, token + "x"), false);
    assert.equal(verifyBookingToken(ID, ""), false);
    assert.equal(verifyBookingToken(ID, null), false);
  });
});

test("a token signed with a different secret is rejected", () => {
  const token = withSecret("old-secret", () => signBookingToken(ID));
  withSecret("new-secret", () => assert.equal(verifyBookingToken(ID, token), false));
});

test("the booking email still works as proof, in any casing", () => {
  withSecret("test-secret", () => {
    const booking = { id: ID, email: "Sam@Example.com" };
    assert.equal(canManageBooking(booking, { email: " sam@example.com " }), true);
    assert.equal(canManageBooking(booking, { email: "someone@else.com" }), false);
    assert.equal(canManageBooking(booking, { token: signBookingToken(ID) }), true);
    assert.equal(canManageBooking(booking, {}), false);
    // A wrong token does not block a correct email.
    assert.equal(canManageBooking(booking, { token: "nope", email: "sam@example.com" }), true);
  });
});

test("the emailed link carries the token and stays compatible with old links", () => {
  withSecret("test-secret", () => {
    const path = manageBookingPath(ID);
    assert.ok(path.startsWith(`/book/manage?booking_id=${ID}&t=`));
    const token = new URL(manageBookingUrl(ID)).searchParams.get("t");
    assert.equal(verifyBookingToken(ID, token), true);
  });
});

test("with no secret configured the link degrades to the email lookup instead of throwing", () => {
  withSecret(undefined, () => {
    assert.equal(signBookingToken(ID), null);
    assert.equal(manageBookingPath(ID), `/book/manage?booking_id=${ID}`);
    assert.equal(verifyBookingToken(ID, "anything"), false);
  });
});
