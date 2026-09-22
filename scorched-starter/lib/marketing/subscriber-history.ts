// lib/marketing/subscriber-history.ts
//
// Turns the consent log into the numbers behind the "subscribers over time"
// charts. Pure, so the shapes are testable without a database.
//
// Everything derives from consent_events rather than from the subscribers
// table, because the table only knows each person's current state. The log
// knows when it changed, which is the whole question.
//
// Counting rule: a person only counts as joining or leaving a channel when
// their state for that channel actually flips. Two opt-in rows in a row (a
// second waiver, a re-import) are one subscriber, not two.
import type { MarketingChannel } from "@/lib/supabase";

export type HistoryEvent = {
  subscriber_id: string;
  channel: MarketingChannel;
  action: "opt_in" | "opt_out";
  occurred_at: string;
};

export type SentCampaign = {
  id: string;
  name: string;
  channel: MarketingChannel;
  sentAt: string;
  recipients: number;
};

export type Bucket = "day" | "week" | "month";

// A state flip, in time order.
export type Transition = {
  channel: MarketingChannel;
  delta: 1 | -1;
  at: Date;
};

// Reduces the raw log to real state changes.
export function transitions(events: HistoryEvent[]): Transition[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const state = new Map<string, boolean>();
  const out: Transition[] = [];

  for (const e of sorted) {
    const key = `${e.subscriber_id}:${e.channel}`;
    const subscribed = state.get(key) ?? false;
    const wants = e.action === "opt_in";
    if (wants === subscribed) continue;
    state.set(key, wants);
    out.push({ channel: e.channel, delta: wants ? 1 : -1, at: new Date(e.occurred_at) });
  }
  return out;
}

// Local calendar day, used for every bucket boundary so a 9pm opt-out does
// not land on tomorrow's bar.
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function bucketKey(d: Date, bucket: Bucket): string {
  if (bucket === "day") return dayKey(d);
  if (bucket === "month") return dayKey(d).slice(0, 7);
  // Week starts Monday.
  const copy = new Date(d);
  const dow = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dow);
  return dayKey(copy);
}

export type SeriesPoint = { date: string; email: number; sms: number };

// Running subscribed count per channel, one point per day from `from` to
// `to` inclusive. History before `from` is folded into the first point, so a
// 30 day view starts at the real count and not at zero.
export function subscriberSeries(events: HistoryEvent[], from: Date, to: Date): SeriesPoint[] {
  const flips = transitions(events);
  let email = 0;
  let sms = 0;
  let i = 0;

  const startKey = dayKey(from);
  while (i < flips.length && dayKey(flips[i].at) < startKey) {
    if (flips[i].channel === "email") email += flips[i].delta;
    else sms += flips[i].delta;
    i++;
  }

  const points: SeriesPoint[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endKey = dayKey(to);
  while (dayKey(cursor) <= endKey) {
    const key = dayKey(cursor);
    while (i < flips.length && dayKey(flips[i].at) === key) {
      if (flips[i].channel === "email") email += flips[i].delta;
      else sms += flips[i].delta;
      i++;
    }
    points.push({ date: key, email, sms });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export type FlowPoint = {
  bucket: string;
  emailJoined: number;
  smsJoined: number;
  // Negative, so they draw below the baseline.
  emailLeft: number;
  smsLeft: number;
};

// Joins and leaves per bucket across the range, with empty buckets kept so
// the x axis is continuous.
export function joinsAndLeaves(
  events: HistoryEvent[],
  from: Date,
  to: Date,
  bucket: Bucket
): FlowPoint[] {
  // Whole days, matching the buckets, so a 9pm join on the first day of the
  // range is not dropped by a noon `from`.
  const startKey = dayKey(from);
  const endKeyForFilter = dayKey(to);
  const flips = transitions(events).filter((f) => {
    const k = dayKey(f.at);
    return k >= startKey && k <= endKeyForFilter;
  });
  const byBucket = new Map<string, FlowPoint>();

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endKey = dayKey(to);
  while (dayKey(cursor) <= endKey) {
    const key = bucketKey(cursor, bucket);
    if (!byBucket.has(key)) {
      byBucket.set(key, { bucket: key, emailJoined: 0, smsJoined: 0, emailLeft: 0, smsLeft: 0 });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const f of flips) {
    const p = byBucket.get(bucketKey(f.at, bucket));
    if (!p) continue;
    if (f.channel === "email") {
      if (f.delta > 0) p.emailJoined++;
      else p.emailLeft--;
    } else {
      if (f.delta > 0) p.smsJoined++;
      else p.smsLeft--;
    }
  }
  return [...byBucket.values()];
}

export type CampaignChurn = SentCampaign & {
  // Opt-outs on the campaign's channel inside the window after it went out.
  optOuts: number;
  // Fraction of recipients, or null when the recipient count is unknown.
  rate: number | null;
};

export const CHURN_WINDOW_HOURS = 72;

// How many people left each campaign's channel in the window after it went
// out. Attribution is by time alone: a leave inside the window counts whether
// or not that person received the campaign, because the unsubscribe link and
// STOP keyword do not say which message prompted them.
export function campaignChurn(
  events: HistoryEvent[],
  campaigns: SentCampaign[],
  windowHours = CHURN_WINDOW_HOURS
): CampaignChurn[] {
  const leaves = transitions(events).filter((f) => f.delta < 0);
  return campaigns
    .map((c) => {
      const start = new Date(c.sentAt).getTime();
      const end = start + windowHours * 60 * 60 * 1000;
      const optOuts = leaves.filter(
        (l) => l.channel === c.channel && l.at.getTime() >= start && l.at.getTime() <= end
      ).length;
      return { ...c, optOuts, rate: c.recipients > 0 ? optOuts / c.recipients : null };
    })
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

// Which bucket size keeps a range readable: about 30 to 60 bars at most.
export function bucketFor(days: number): Bucket {
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}
