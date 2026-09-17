"use client";

// Marketing admin: subscribers on one tab, campaigns on the other.
//
// Every send passes through a confirm dialog that states the recipient count
// and the channel, and says plainly when MARKETING_LIVE is off so nobody
// mistakes a suppressed run for a real one.
import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import { describeSegment } from "@/lib/marketing/segment";
import { validateSmsBody, withStopNotice } from "@/lib/marketing/message-rules";
import { costEstimate, formatUsd } from "@/lib/marketing/sms-segments";
import type {
  CampaignRecord,
  ConsentEventRecord,
  SubscriberRecord,
} from "@/lib/supabase";
import { Download, Loader2, Mail, MessageSquare, Plus, X } from "lucide-react";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";
const labelCls = `${vulfMono.className} block text-xs text-neutral-500 mb-1.5`;
const btnCls = `${vulfMono.className} rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.1em]`;

type Tab = "subscribers" | "campaigns";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken() ?? ""}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Request failed");
  return body;
}

// ── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmSend({
  campaign,
  recipientCount,
  onCancel,
  onConfirm,
  busy,
}: {
  campaign: CampaignRecord;
  recipientCount: number | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className={`${vulfMono.className} text-sm tracking-[0.15em] uppercase mb-4`}>
          Confirm send
        </h2>
        <p className="text-sm text-neutral-700 mb-3">
          You are about to send <strong>{campaign.name}</strong> by{" "}
          <strong>{campaign.channel === "sms" ? "text message" : "email"}</strong> to{" "}
          <strong>{recipientCount === null ? "an unknown number of" : recipientCount}</strong>{" "}
          {recipientCount === 1 ? "person" : "people"} ({describeSegment(campaign.segment)}).
        </p>
        {campaign.channel === "sms" && (
          <p className="text-xs text-neutral-500 mb-3">
            Texts are paced at the configured throughput and pause overnight for quiet hours. You
            can pause the campaign at any time.
          </p>
        )}
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onCancel} className={`${btnCls} border border-black/20 text-neutral-600`}>
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`${btnCls} bg-[#884A20] text-white disabled:opacity-60`}
          >
            {busy ? "SENDING…" : "SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subscribers ──────────────────────────────────────────────────────────────

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [smsStatus, setSmsStatus] = useState("");
  const [tag, setTag] = useState("");
  const [history, setHistory] = useState<{ subscriber: SubscriberRecord; events: ConsentEventRecord[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (emailStatus) params.set("emailStatus", emailStatus);
      if (smsStatus) params.set("smsStatus", smsStatus);
      if (tag) params.set("tag", tag);
      const body = await api(`/api/admin/marketing/subscribers?${params}`);
      setSubscribers(body.subscribers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, emailStatus, smsStatus, tag]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  async function openHistory(subscriber: SubscriberRecord) {
    try {
      const body = await api(`/api/admin/marketing/consent?subscriberId=${subscriber.id}`);
      setHistory({ subscriber, events: body.events });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    }
  }

  async function unsubscribe(subscriber: SubscriberRecord, channel: "email" | "sms") {
    if (!confirm(`Unsubscribe this person from ${channel}? This is logged as a staff action.`)) return;
    try {
      await api("/api/admin/marketing/subscribers", {
        method: "PATCH",
        body: JSON.stringify({ id: subscriber.id, channel }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function exportCsv() {
    const res = await fetch("/api/admin/marketing/export", {
      headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
    });
    if (!res.ok) {
      setError("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className={labelCls}>Search</label>
          <input
            className={inputCls}
            placeholder="Name, email, or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Email status</label>
          <select className={inputCls} value={emailStatus} onChange={(e) => setEmailStatus(e.target.value)}>
            <option value="">Any</option>
            {["subscribed", "unsubscribed", "bounced", "complained", "none"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>SMS status</label>
          <select className={inputCls} value={smsStatus} onChange={(e) => setSmsStatus(e.target.value)}>
            <option value="">Any</option>
            {["subscribed", "unsubscribed", "invalid", "none"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tag</label>
          <input className={inputCls} placeholder="legacy-sms" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
        <button onClick={exportCsv} className={`${btnCls} border border-black/20 text-neutral-600 flex items-center gap-1.5`}>
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mb-2`}>
            {subscribers.length} shown{subscribers.length === 500 ? " (capped at 500)" : ""}
          </p>
          <div className="overflow-x-auto rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left">
                <tr className={`${vulfMono.className} text-xs text-neutral-500`}>
                  <th className="p-3">Person</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">SMS</th>
                  <th className="p-3">Tags</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} className="border-t border-black/5">
                    <td className="p-3">
                      <div>{[s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}</div>
                      <div className="text-xs text-neutral-400">{s.email ?? formatPhoneForDisplay(s.phone)}</div>
                    </td>
                    <td className="p-3">
                      <StatusPill status={s.email_status} />
                      {s.email_status === "subscribed" && (
                        <button onClick={() => unsubscribe(s, "email")} className="block text-xs text-neutral-400 underline mt-1">
                          unsubscribe
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusPill status={s.sms_status} />
                      {s.sms_status === "subscribed" && (
                        <button onClick={() => unsubscribe(s, "sms")} className="block text-xs text-neutral-400 underline mt-1">
                          unsubscribe
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-xs text-neutral-500">{(s.tags ?? []).join(", ") || "—"}</td>
                    <td className="p-3">
                      <button onClick={() => openHistory(s)} className="text-xs underline text-neutral-500">
                        history
                      </button>
                    </td>
                  </tr>
                ))}
                {subscribers.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-neutral-400 text-sm">No subscribers match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className={`${vulfMono.className} text-sm tracking-[0.15em] uppercase`}>
                Consent history
              </h2>
              <button onClick={() => setHistory(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-neutral-500 mb-4">
              {history.subscriber.email ?? formatPhoneForDisplay(history.subscriber.phone)}
            </p>
            <div className="space-y-3">
              {history.events.map((e) => (
                <div key={e.id} className="rounded-lg border border-black/10 p-3">
                  <div className="flex gap-2 items-center text-xs">
                    <span className={`${vulfMono.className} uppercase`}>{e.channel}</span>
                    <span className={e.action === "opt_in" ? "text-green-600" : "text-red-500"}>
                      {e.action === "opt_in" ? "opted in" : "opted out"}
                    </span>
                    <span className="text-neutral-400">via {e.source}</span>
                    <span className="text-neutral-400 ml-auto">
                      {new Date(e.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {/* The exact wording shown at the time, which is the whole
                      point of keeping this log. */}
                  <p className="text-xs text-neutral-600 mt-2 italic">{e.consent_text}</p>
                  {e.ip && <p className="text-[11px] text-neutral-400 mt-1">IP {e.ip}</p>}
                </div>
              ))}
              {history.events.length === 0 && (
                <p className="text-sm text-neutral-400">No consent events recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "subscribed" ? "bg-green-50 text-green-700"
    : status === "none" ? "bg-neutral-100 text-neutral-500"
    : "bg-red-50 text-red-600";
  return <span className={`${vulfMono.className} inline-block rounded px-2 py-0.5 text-[11px] ${tone}`}>{status}</span>;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

type SmsStats = {
  pending: number; sending: number; sent: number; delivered: number;
  failed: number; skipped: number; total: number; optOutsWithin48h: number;
  estimate: { estimatedDays: number; estimatedCompletion: string | null; perDay: number };
};
type EmailStats = {
  sent: number; delivered: number; opened: number; clicked: number;
  bounced: number; complained: number; failed: number; unsubscribed: number;
};

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composing, setComposing] = useState(false);
  const [confirming, setConfirming] = useState<CampaignRecord | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<Record<string, { sms?: SmsStats; email?: EmailStats }>>({});

  const load = useCallback(async () => {
    try {
      const body = await api("/api/admin/marketing/campaigns");
      setCampaigns(body.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadStats(c: CampaignRecord) {
    try {
      const body = await api(`/api/admin/marketing/campaigns/${c.id}/stats`);
      setStats((prev) => ({ ...prev, [c.id]: body }));
    } catch { /* stats are decoration; a failure here should not break the list */ }
  }

  async function beginSend(c: CampaignRecord) {
    setConfirming(c);
    setConfirmCount(null);
    try {
      const params = new URLSearchParams({
        countFor: "preview",
        channel: c.channel,
        tags: (c.segment?.tags ?? []).join(","),
        match: c.segment?.match ?? "any",
      });
      const body = await api(`/api/admin/marketing/campaigns?${params}`);
      setConfirmCount(body.count);
    } catch {
      setConfirmCount(null);
    }
  }

  async function doSend() {
    if (!confirming) return;
    setSending(true);
    try {
      const body = await api(`/api/admin/marketing/campaigns/${confirming.id}/send`, { method: "POST" });
      setNotice(
        body.live
          ? confirming.channel === "sms"
            ? `Queued ${body.queued} texts at up to ${body.estimate?.perDay ?? 0} a day, finishing ${
                (body.estimate?.estimatedDays ?? 1) <= 1 ? "today" : `in about ${body.estimate.estimatedDays} days`
              }.`
            : `Sent to ${body.sent} of ${body.attempted}.`
          : "MARKETING_LIVE is off, so nothing was actually sent. The run was logged instead."
      );
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(c: CampaignRecord, status: string) {
    try {
      await api(`/api/admin/marketing/campaigns/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function sendTest(c: CampaignRecord) {
    const to = prompt(
      c.channel === "email" ? "Send a test to which email address?" : "Send a test to which phone number?"
    );
    if (!to) return;
    try {
      const body = await api(`/api/admin/marketing/campaigns/${c.id}/test`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      setNotice(body.live ? `Test sent to ${to}.` : "MARKETING_LIVE is off, so the test was logged rather than sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {notice && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {notice}
        </div>
      )}

      <button
        onClick={() => setComposing(true)}
        className={`${btnCls} bg-[#884A20] text-white flex items-center gap-1.5 mb-4`}
      >
        <Plus className="w-3.5 h-3.5" /> NEW CAMPAIGN
      </button>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-xl border border-black/10 p-4">
            <div className="flex items-start gap-3">
              {c.channel === "sms" ? <MessageSquare className="w-4 h-4 mt-1" /> : <Mail className="w-4 h-4 mt-1" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm">{c.name}</strong>
                  <span className={`${vulfMono.className} text-[11px] rounded px-2 py-0.5 bg-neutral-100 text-neutral-600`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{describeSegment(c.segment)}</p>
                <p className="text-sm text-neutral-600 mt-2 whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              {["draft", "scheduled", "paused"].includes(c.status) && (
                <button onClick={() => beginSend(c)} className={`${btnCls} bg-[#884A20] text-white`}>
                  {c.status === "paused" ? "RESUME" : "SEND"}
                </button>
              )}
              {c.status === "sending" && (
                <button onClick={() => setStatus(c, "paused")} className={`${btnCls} border border-black/20 text-neutral-600`}>
                  PAUSE
                </button>
              )}
              {["sending", "paused", "scheduled"].includes(c.status) && (
                <button onClick={() => setStatus(c, "cancelled")} className={`${btnCls} border border-red-200 text-red-600`}>
                  CANCEL
                </button>
              )}
              <button onClick={() => sendTest(c)} className={`${btnCls} border border-black/20 text-neutral-600`}>
                TEST SEND
              </button>
              <button onClick={() => loadStats(c)} className={`${btnCls} border border-black/20 text-neutral-600`}>
                STATS
              </button>
            </div>

            {stats[c.id]?.sms && (
              <div className="mt-3 text-xs text-neutral-600 grid grid-cols-3 md:grid-cols-7 gap-2">
                {(["pending", "sent", "delivered", "failed", "skipped"] as const).map((k) => (
                  <div key={k}><div className="text-neutral-400">{k}</div><div>{stats[c.id].sms![k]}</div></div>
                ))}
                <div><div className="text-neutral-400">opt-outs 48h</div><div>{stats[c.id].sms!.optOutsWithin48h}</div></div>
                <div>
                  <div className="text-neutral-400">finishes in</div>
                  <div>
                    {stats[c.id].sms!.estimate.estimatedDays <= 1
                      ? "today"
                      : `${stats[c.id].sms!.estimate.estimatedDays} days`}
                  </div>
                </div>
              </div>
            )}
            {stats[c.id]?.email && (
              <div className="mt-3 text-xs text-neutral-600 grid grid-cols-4 md:grid-cols-8 gap-2">
                {(["sent", "delivered", "opened", "clicked", "bounced", "complained", "failed", "unsubscribed"] as const).map((k) => (
                  <div key={k}><div className="text-neutral-400">{k}</div><div>{stats[c.id].email![k]}</div></div>
                ))}
              </div>
            )}
          </div>
        ))}
        {campaigns.length === 0 && <p className="text-sm text-neutral-400">No campaigns yet.</p>}
      </div>

      {composing && <Composer onClose={() => setComposing(false)} onSaved={() => { setComposing(false); load(); }} />}

      {confirming && (
        <ConfirmSend
          campaign={confirming}
          recipientCount={confirmCount}
          busy={sending}
          onCancel={() => setConfirming(null)}
          onConfirm={doSend}
        />
      )}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function Composer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [match, setMatch] = useState<"any" | "all">("any");
  const [count, setCount] = useState<number | null>(null);
  const [costPerSegment, setCostPerSegment] = useState(0.004);
  const [mediaUrl, setMediaUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Live recipient count, refreshed as the segment is edited.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ countFor: "preview", channel, tags, match });
        const body = await api(`/api/admin/marketing/campaigns?${params}`);
        setCount(body.count);
        if (typeof body.costPerSegment === "number") setCostPerSegment(body.costPerSegment);
      } catch {
        setCount(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [channel, tags, match]);

  const issues = channel === "sms" ? validateSmsBody(body) : [];
  const finalBody = channel === "sms" ? withStopNotice(body) : body;
  // Costed against the message that actually goes out, which includes the
  // auto-appended opt-out notice.
  const cost = channel === "sms" ? costEstimate(finalBody, costPerSegment, count ?? 0) : null;

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/marketing/campaigns", {
        method: "POST",
        body: JSON.stringify({
          channel,
          name,
          subject,
          body,
          mediaUrl: mediaUrl.trim() || undefined,
          segment: { tags: tags.split(",").map((t) => t.trim()).filter(Boolean), match },
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 my-8">
        <div className="flex justify-between items-start mb-4">
          <h2 className={`${vulfMono.className} text-sm tracking-[0.15em] uppercase`}>New campaign</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Channel</label>
            <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as "email" | "sms")}>
              <option value="email">Email</option>
              <option value="sms">Text message</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Internal name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {channel === "email" && (
            <div>
              <label className={labelCls}>Subject</label>
              <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}

          <div>
            <label className={labelCls}>
              Message {channel === "sms" && <span className="text-neutral-400">(markdown not supported in texts)</span>}
            </label>
            <textarea className={`${inputCls} min-h-[120px]`} value={body} onChange={(e) => setBody(e.target.value)} />
            {channel === "sms" && cost && (
              <div className="mt-1 space-y-1">
                <p className={`${vulfMono.className} text-xs ${cost.segments > 1 ? "text-amber-600" : "text-neutral-400"}`}>
                  {cost.units} {cost.encoding === "UCS-2" ? "UCS-2 units" : "GSM-7 characters"}
                  {" · "}
                  {cost.segments} segment{cost.segments === 1 ? "" : "s"}
                  {" · "}
                  limit {cost.encoding === "UCS-2" ? "70/67" : "160/153"}
                </p>

                {/* Shows exactly what will go out, including the opt-out
                    notice that gets appended automatically. */}
                {body.trim() && (
                  <p className="text-xs text-neutral-500 bg-neutral-50 rounded p-2 whitespace-pre-wrap">
                    {finalBody}
                  </p>
                )}

                {issues.map((i, idx) => (
                  <p key={idx} className={`text-xs ${i.level === "error" ? "text-red-500" : "text-amber-600"}`}>
                    {i.message}
                  </p>
                ))}

                {count !== null && count > 0 && cost.segments > 0 && (
                  <p className={`${vulfMono.className} text-xs text-neutral-500`}>
                    Estimated cost {formatUsd(cost.total)} ({formatUsd(cost.perMessage)} x {count} recipients)
                  </p>
                )}
              </div>
            )}

            {channel === "sms" && (
              <div className="mt-3">
                <label className={labelCls}>Image URL (optional, sends as MMS)</label>
                <input
                  className={inputCls}
                  placeholder="https://scorchedstudio.com/images/promo.jpg"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                {mediaUrl.trim() && (
                  <p className="text-xs text-amber-600 mt-1">
                    Adding an image makes this an MMS, which bills at a higher per-message rate than
                    SMS and is not covered by the estimate above. Keep the file under 1 MB.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Segment tags (comma separated, blank means everyone)</label>
            <input className={inputCls} placeholder="legacy-sms, orem" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Match</label>
            <select className={inputCls} value={match} onChange={(e) => setMatch(e.target.value as "any" | "all")}>
              <option value="any">Any of these tags</option>
              <option value="all">All of these tags</option>
            </select>
          </div>

          <p className={`${vulfMono.className} text-xs text-neutral-500`}>
            {count === null ? "Counting…" : `${count} recipient(s) match right now`}
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className={`${btnCls} border border-black/20 text-neutral-600`}>CANCEL</button>
          <button
            onClick={save}
            disabled={saving || issues.some((i) => i.level === "error")}
            className={`${btnCls} bg-[#884A20] text-white disabled:opacity-60`}
          >
            {saving ? "SAVING…" : "SAVE DRAFT"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingAdminPage() {
  const [tab, setTab] = useState<Tab>("subscribers");

  return (
    <div className="p-6">
      <h1 className={`${vulfMono.className} text-lg tracking-[0.15em] uppercase mb-6`}>Marketing</h1>

      <div className="flex gap-2 mb-6">
        {(["subscribers", "campaigns"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${btnCls} ${tab === t ? "bg-[#884A20] text-white" : "border border-black/20 text-neutral-600"}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === "subscribers" ? <SubscribersTab /> : <CampaignsTab />}
    </div>
  );
}
