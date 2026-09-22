"use client";

// The subscribers-over-time panel at the top of the Subscribers tab.
//
// Three views of one dataset, all scoped by the range control in the row
// above them: the running count per channel (with a marker on each day a
// campaign went out), joins and leaves per period, and a table of how many
// people left in the 72 hours after each send.
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import {
  bucketFor,
  campaignChurn,
  CHURN_WINDOW_HOURS,
  joinsAndLeaves,
  subscriberSeries,
  type HistoryEvent,
  type SentCampaign,
  type SeriesPoint,
} from "@/lib/marketing/subscriber-history";

// Same tokens as the reporting pages, so the two admin areas read as one.
const EMAIL = "#884A20";
const SMS = "#418A5C";
const INK = "#171717";
const MUTED = "#9ca3af";
const GRID = "#f0f0f0";
const AXIS_TICK = { fontSize: 11, fontFamily: "var(--font-display,monospace)", fill: MUTED };

type Range = "30" | "90" | "365" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "365", label: "12 months" },
  { key: "all", label: "All" },
];

function shortDate(key: string): string {
  // "2026-04-01" or "2026-04" -> "Apr 1" / "Apr 2026".
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return d
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const tooltipBox: React.CSSProperties = {
  fontFamily: "var(--font-display,monospace)",
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "10px 14px",
  minWidth: 160,
};

// Value first, series name second, keyed by a short line of the series color
// rather than colored text.
function Row({ color, value, name }: { color: string; value: number; name: string }) {
  return (
    <p style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", color: INK }}>
      <span style={{ width: 12, height: 2, background: color, display: "inline-block" }} />
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{value}</strong>
      <span style={{ color: MUTED }}>{name}</span>
    </p>
  );
}

function CountTooltip({
  active,
  payload,
  label,
  channel,
  sends,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  channel: "email" | "sms";
  sends: Map<string, SentCampaign[]>;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = payload.find((p) => p.dataKey === channel)?.value ?? 0;
  const went = (sends.get(label) ?? []).filter((c) => c.channel === channel);
  return (
    <div style={tooltipBox}>
      <p style={{ fontWeight: "bold", marginBottom: 6, color: "#374151" }}>{shortDate(label)}</p>
      <Row color={channel === "email" ? EMAIL : SMS} value={value} name="subscribed" />
      {went.map((c) => (
        <p key={c.id} style={{ marginTop: 6, color: MUTED }}>
          Sent: {c.name}
        </p>
      ))}
    </div>
  );
}

// One channel's running count. The two channels differ by an order of
// magnitude, so they get their own charts and scales rather than sharing an
// axis that would flatten the smaller one, or a second axis that would invent
// a relationship between them.
function CountChart({
  channel,
  series,
  sends,
}: {
  channel: "email" | "sms";
  series: SeriesPoint[];
  sends: Map<string, SentCampaign[]>;
}) {
  const color = channel === "email" ? EMAIL : SMS;
  const markers = [...sends.entries()]
    .filter(([, list]) => list.some((c) => c.channel === channel))
    .map(([date]) => date);
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-sm font-medium mb-2 flex items-center gap-2">
        <span className="inline-block w-3 h-0.5" style={{ background: color }} />
        {channel === "email" ? "Email subscribers" : "SMS subscribers"}
      </p>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickFormatter={shortDate}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} domain={["auto", "auto"]} />
            <Tooltip content={<CountTooltip channel={channel} sends={sends} />} />
            {markers.map((date) => (
              <ReferenceLine key={date} x={date} stroke={MUTED} strokeWidth={1} />
            ))}
            <Line
              type="monotone"
              dataKey={channel}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {markers.length > 0 && (
        <p className={`${vulfMono.className} text-[11px] text-neutral-400 mt-2`}>
          Vertical lines mark the days {channel === "email" ? "an email" : "a text"} campaign went out.
        </p>
      )}
    </div>
  );
}

function FlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const get = (k: string) => Math.abs(payload.find((p) => p.dataKey === k)?.value ?? 0);
  return (
    <div style={tooltipBox}>
      <p style={{ fontWeight: "bold", marginBottom: 6, color: "#374151" }}>{shortDate(label)}</p>
      <p style={{ color: MUTED, marginBottom: 2 }}>Joined</p>
      <Row color={EMAIL} value={get("emailJoined")} name="email" />
      <Row color={SMS} value={get("smsJoined")} name="SMS" />
      <p style={{ color: MUTED, marginTop: 6, marginBottom: 2 }}>Left</p>
      <Row color={EMAIL} value={get("emailLeft")} name="email" />
      <Row color={SMS} value={get("smsLeft")} name="SMS" />
    </div>
  );
}

function Legend({ shape }: { shape: "line" | "rect" }) {
  const cls = shape === "line" ? "inline-block w-3 h-0.5" : "inline-block w-3 h-3 rounded-sm";
  return (
    <div className={`${vulfMono.className} flex gap-4 text-[11px] text-neutral-500`}>
      <span className="flex items-center gap-1.5">
        <span className={cls} style={{ background: EMAIL }} /> Email
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cls} style={{ background: SMS }} /> SMS
      </span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-5 py-4">
      <p className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400 mb-1`}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: INK }}>
        {value}
      </p>
      {sub && <p className={`${vulfMono.className} text-xs mt-0.5 text-neutral-400`}>{sub}</p>}
    </div>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export default function SubscriberHistory() {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [campaigns, setCampaigns] = useState<SentCampaign[]>([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("90");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/marketing/subscribers/history", {
          headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Could not load history");
        setEvents(body.events ?? []);
        setCampaigns(body.campaigns ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load history");
      }
    })();
  }, []);

  const view = useMemo(() => {
    if (!events) return null;
    const to = new Date();
    let from: Date;
    if (range === "all") {
      const first = events[0]?.occurred_at;
      from = first ? new Date(first) : new Date(to.getTime() - 30 * 86400000);
    } else {
      from = new Date(to.getTime() - Number(range) * 86400000);
    }
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const bucket = bucketFor(days);

    const series = subscriberSeries(events, from, to);
    const flow = joinsAndLeaves(events, from, to, bucket);
    const churn = campaignChurn(events, campaigns).filter((c) => new Date(c.sentAt) >= from);

    const sends = new Map<string, SentCampaign[]>();
    for (const c of campaigns) {
      const key = subscriberSeries([], new Date(c.sentAt), new Date(c.sentAt))[0]?.date;
      if (!key) continue;
      sends.set(key, [...(sends.get(key) ?? []), c]);
    }

    const first = series[0];
    const last = series[series.length - 1];
    return {
      series,
      flow,
      churn,
      sends,
      bucket,
      email: last?.email ?? 0,
      sms: last?.sms ?? 0,
      emailDelta: (last?.email ?? 0) - (first?.email ?? 0),
      smsDelta: (last?.sms ?? 0) - (first?.sms ?? 0),
    };
  }, [events, campaigns, range]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? "";

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className={`${vulfMono.className} text-xs tracking-[0.15em] uppercase text-neutral-500`}>
          Subscribers over time
        </h2>
        <div className="flex rounded-lg border border-black/15 overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`${vulfMono.className} px-3 py-1.5 text-xs transition-colors ${
                range === r.key ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {!view ? (
        !error && <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Email subscribers" value={view.email.toLocaleString()} />
            <Stat label="SMS subscribers" value={view.sms.toLocaleString()} />
            <Stat label="Email change" value={signed(view.emailDelta)} sub={`over ${rangeLabel}`} />
            <Stat label="SMS change" value={signed(view.smsDelta)} sub={`over ${rangeLabel}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CountChart channel="email" series={view.series} sends={view.sends} />
            <CountChart channel="sms" series={view.series} sends={view.sends} />
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Joined and left, by {view.bucket}
              </p>
              <Legend shape="rect" />
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.flow} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} stackOffset="sign" barCategoryGap="30%">
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    tickFormatter={shortDate}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} tickFormatter={(v) => String(Math.abs(v))} />
                  <Tooltip content={<FlowTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <ReferenceLine y={0} stroke="#d4d4d4" strokeWidth={1} />
                  <Bar dataKey="emailJoined" stackId="a" fill={EMAIL} maxBarSize={20} isAnimationActive={false} />
                  <Bar dataKey="smsJoined" stackId="a" fill={SMS} maxBarSize={20} isAnimationActive={false} />
                  <Bar dataKey="emailLeft" stackId="a" fill={EMAIL} fillOpacity={0.45} maxBarSize={20} isAnimationActive={false} />
                  <Bar dataKey="smsLeft" stackId="a" fill={SMS} fillOpacity={0.45} maxBarSize={20} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className={`${vulfMono.className} text-[11px] text-neutral-400 mt-2`}>
              Above the line joined, below the line left.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-sm font-medium mb-1">Unsubscribes after each send</p>
            <p className="text-xs text-neutral-500 mb-3">
              People who left that channel within {CHURN_WINDOW_HOURS} hours of the campaign going out.
            </p>
            {view.churn.length === 0 ? (
              <p className="text-sm text-neutral-400">No campaigns went out in this range.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${vulfMono.className} text-[10px] uppercase tracking-widest text-neutral-400`}>
                    <th className="text-left font-normal pb-2">Campaign</th>
                    <th className="text-left font-normal pb-2">Sent</th>
                    <th className="text-right font-normal pb-2">Recipients</th>
                    <th className="text-right font-normal pb-2">Left</th>
                    <th className="text-right font-normal pb-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {view.churn.map((c) => (
                    <tr key={c.id} className="border-t border-black/5">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ background: c.channel === "email" ? EMAIL : SMS }}
                          />
                          {c.name}
                          <span className="text-xs text-neutral-400">{c.channel === "email" ? "email" : "SMS"}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-neutral-500 whitespace-nowrap">{fullDate(c.sentAt)}</td>
                      <td className="py-2 text-right tabular-nums">{c.recipients ? c.recipients.toLocaleString() : "?"}</td>
                      <td className="py-2 text-right tabular-nums">{c.optOuts}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-500">
                        {c.rate === null ? "?" : `${(c.rate * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
