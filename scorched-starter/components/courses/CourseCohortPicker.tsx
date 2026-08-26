"use client";

import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import type { CohortAvailability, CohortSessionRecord, CohortRecord } from "@/lib/courses";
import { formatSessionDate, formatSessionTime } from "@/lib/courses";

type CohortWithDetail = CohortRecord & {
  sessions: CohortSessionRecord[];
  availability: CohortAvailability | null;
};

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";
const labelCls = "block text-sm font-medium mb-1";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CourseCohortPicker({
  cohorts,
  initialCohortId,
}: {
  cohorts: CohortWithDetail[];
  initialCohortId?: string;
}) {
  const preselected = initialCohortId && cohorts.some((c) => c.id === initialCohortId) ? initialCohortId : null;
  const [selectedId, setSelectedId] = useState<string | null>(preselected ?? cohorts[0]?.id ?? null);
  const [fullOverride, setFullOverride] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);

  const selected = cohorts.find((c) => c.id === selectedId) ?? null;
  const isFull = selected ? fullOverride[selected.id] ?? (selected.availability?.is_full ?? true) : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setLoading(true);
    try {
      if (isFull) {
        const res = await fetch("/api/courses/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cohort_id: selected.id, name, email, phone: phone || undefined }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Something went wrong joining the waitlist. Please try again.");
          return;
        }
        setWaitlisted(true);
      } else {
        const res = await fetch("/api/courses/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cohort_id: selected.id, name, email, phone: phone || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          if (data.full) {
            // Someone else filled the last seat while this page was open —
            // switch this cohort to waitlist mode instead of just erroring.
            setFullOverride((prev) => ({ ...prev, [selected.id]: true }));
            setError("This cohort just filled up. You can join the waitlist below instead.");
          } else {
            setError(data.error || "Something went wrong starting checkout. Please try again.");
          }
          return;
        }
        window.location.href = data.url;
        return;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (waitlisted) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-6 text-center">
        <p className="font-semibold text-neutral-900 mb-1">You&apos;re on the waitlist</p>
        <p className={`${vulfMono.className} text-sm text-neutral-500`}>
          We&apos;ll email you at {email} if a seat opens up in the {selected?.label} cohort.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="h3 font-bold mb-4">Choose a cohort</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {cohorts.map((cohort) => {
          const full = fullOverride[cohort.id] ?? (cohort.availability?.is_full ?? true);
          const seatsRemaining = cohort.availability?.seats_remaining ?? 0;
          const active = selectedId === cohort.id;
          return (
            <button
              key={cohort.id}
              type="button"
              onClick={() => setSelectedId(cohort.id)}
              className={`text-left rounded-2xl border p-5 transition-colors ${
                active ? "border-brand bg-[#F6E4E1]" : "border-black/10 bg-white hover:border-black/25"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-neutral-900">{cohort.label}</h3>
                <span
                  className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    full ? "bg-neutral-100 text-neutral-500" : "bg-green-100 text-green-700"
                  }`}
                >
                  {full ? "Full" : `${seatsRemaining} seat${seatsRemaining === 1 ? "" : "s"} left`}
                </span>
              </div>
              <ul className={`${vulfMono.className} text-xs text-neutral-500 space-y-1 mb-3`}>
                {cohort.sessions.map((s) => (
                  <li key={s.id}>
                    {formatSessionDate(s.session_date)}, {formatSessionTime(s.start_time)}–{formatSessionTime(s.end_time)}
                  </li>
                ))}
              </ul>
              <p className="text-lg font-bold">{formatCents(cohort.price_cents)}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-black/10 bg-white p-6 space-y-4">
          <h3 className="font-semibold text-neutral-900">
            {isFull ? `Join the waitlist for ${selected.label}` : `Enroll in ${selected.label}`}
          </h3>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Phone (optional)</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
          >
            {loading
              ? "Please wait…"
              : isFull
                ? "Join Waitlist"
                : `Enroll & Pay ${formatCents(selected.price_cents)}`}
          </button>
        </form>
      )}
    </div>
  );
}
