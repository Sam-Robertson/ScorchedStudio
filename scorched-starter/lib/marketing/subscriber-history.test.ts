import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketFor,
  bucketKey,
  campaignChurn,
  joinsAndLeaves,
  subscriberSeries,
  transitions,
  type HistoryEvent,
} from "./subscriber-history.ts";

const ev = (
  subscriber_id: string,
  channel: "email" | "sms",
  action: "opt_in" | "opt_out",
  occurred_at: string
): HistoryEvent => ({ subscriber_id, channel, action, occurred_at });

// Noon local, so day boundaries are unambiguous in any zone the tests run in.
const day = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00`);

test("a repeated opt-in is one subscriber, not two", () => {
  const t = transitions([
    ev("a", "email", "opt_in", "2026-04-01T12:00:00"),
    ev("a", "email", "opt_in", "2026-05-01T12:00:00"),
  ]);
  assert.equal(t.length, 1);
  assert.equal(t[0].delta, 1);
});

test("an opt-out with no prior opt-in does not go negative", () => {
  const t = transitions([ev("a", "sms", "opt_out", "2026-04-01T12:00:00")]);
  assert.equal(t.length, 0);
});

test("channels are tracked independently for the same person", () => {
  const t = transitions([
    ev("a", "email", "opt_in", "2026-04-01T12:00:00"),
    ev("a", "sms", "opt_in", "2026-04-01T12:00:00"),
    ev("a", "sms", "opt_out", "2026-04-02T12:00:00"),
  ]);
  assert.deepEqual(t.map((x) => [x.channel, x.delta]), [["email", 1], ["sms", 1], ["sms", -1]]);
});

test("events arrive out of order and are still applied chronologically", () => {
  const t = transitions([
    ev("a", "email", "opt_out", "2026-04-03T12:00:00"),
    ev("a", "email", "opt_in", "2026-04-01T12:00:00"),
  ]);
  assert.deepEqual(t.map((x) => x.delta), [1, -1]);
});

test("the series starts at the real count when history predates the range", () => {
  const events = [
    ev("a", "email", "opt_in", "2026-03-01T12:00:00"),
    ev("b", "email", "opt_in", "2026-03-15T12:00:00"),
    ev("c", "sms", "opt_in", "2026-04-02T12:00:00"),
    ev("a", "email", "opt_out", "2026-04-03T12:00:00"),
  ];
  const s = subscriberSeries(events, day("2026-04-01"), day("2026-04-04"));
  assert.deepEqual(s, [
    { date: "2026-04-01", email: 2, sms: 0 },
    { date: "2026-04-02", email: 2, sms: 1 },
    { date: "2026-04-03", email: 1, sms: 1 },
    { date: "2026-04-04", email: 1, sms: 1 },
  ]);
});

test("joins and leaves land in the right daily buckets, leaves negative", () => {
  const events = [
    ev("a", "email", "opt_in", "2026-04-01T09:00:00"),
    ev("b", "email", "opt_in", "2026-04-01T21:30:00"),
    ev("a", "email", "opt_out", "2026-04-02T08:00:00"),
    ev("c", "sms", "opt_in", "2026-04-02T08:00:00"),
  ];
  const f = joinsAndLeaves(events, day("2026-04-01"), day("2026-04-03"), "day");
  assert.equal(f.length, 3);
  assert.deepEqual(f[0], { bucket: "2026-04-01", emailJoined: 2, smsJoined: 0, emailLeft: 0, smsLeft: 0 });
  assert.deepEqual(f[1], { bucket: "2026-04-02", emailJoined: 0, smsJoined: 1, emailLeft: -1, smsLeft: 0 });
  assert.deepEqual(f[2], { bucket: "2026-04-03", emailJoined: 0, smsJoined: 0, emailLeft: 0, smsLeft: 0 });
});

test("weekly buckets start on Monday and empty weeks are kept", () => {
  // 2026-04-01 is a Wednesday; its week starts Mon 2026-03-30.
  assert.equal(bucketKey(day("2026-04-01"), "week"), "2026-03-30");
  const f = joinsAndLeaves([], day("2026-04-01"), day("2026-04-20"), "week");
  assert.deepEqual(f.map((p) => p.bucket), ["2026-03-30", "2026-04-06", "2026-04-13", "2026-04-20"]);
});

test("campaign churn counts only that channel's leaves inside the window", () => {
  const events = [
    ev("a", "email", "opt_in", "2026-04-01T12:00:00"),
    ev("b", "email", "opt_in", "2026-04-01T12:00:00"),
    ev("c", "sms", "opt_in", "2026-04-01T12:00:00"),
    ev("a", "email", "opt_out", "2026-05-01T15:00:00"), // 3h after send
    ev("c", "sms", "opt_out", "2026-05-01T15:00:00"), // other channel
    ev("b", "email", "opt_out", "2026-05-06T12:00:00"), // outside 72h
  ];
  const [c] = campaignChurn(events, [
    { id: "x", name: "Launch", channel: "email", sentAt: "2026-05-01T12:00:00", recipients: 200 },
  ]);
  assert.equal(c.optOuts, 1);
  assert.equal(c.rate, 0.005);
});

test("a campaign with no known recipient count has no rate", () => {
  const [c] = campaignChurn([], [
    { id: "x", name: "Launch", channel: "sms", sentAt: "2026-05-01T12:00:00", recipients: 0 },
  ]);
  assert.equal(c.optOuts, 0);
  assert.equal(c.rate, null);
});

test("bucket size follows the range length", () => {
  assert.equal(bucketFor(30), "day");
  assert.equal(bucketFor(90), "week");
  assert.equal(bucketFor(365), "month");
});
