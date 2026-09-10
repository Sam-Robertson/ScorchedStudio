"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import type { CohortAvailability, CohortSessionRecord, CohortRecord } from "@/lib/courses";
import { formatSessionDate, formatSessionDateShort, formatSessionTime } from "@/lib/courses";

type CohortWithDetail = CohortRecord & {
  sessions: CohortSessionRecord[];
  availability: CohortAvailability | null;
};

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";
const labelCls = "block text-sm font-medium mb-1";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Every session in a cohort normally runs at the same time, so printing it on
// all four dates is just noise. Returns the one shared time range to show once
// above the dates, or null if a cohort ever has a session that differs, in
// which case each row carries its own time again rather than quietly lying.
function uniformSessionTime(sessions: CohortSessionRecord[]): string | null {
  if (sessions.length === 0) return null;
  const range = (s: CohortSessionRecord) =>
    `${formatSessionTime(s.start_time)}–${formatSessionTime(s.end_time)}`;
  const first = range(sessions[0]);
  return sessions.every((s) => range(s) === first) ? first : null;
}

export default function CourseCohortPicker({
  cohorts,
  initialCohortId,
  accountEmail,
}: {
  cohorts: CohortWithDetail[];
  initialCohortId?: string;
  accountEmail: string | null;
}) {
  const preselected = initialCohortId && cohorts.some((c) => c.id === initialCohortId) ? initialCohortId : null;
  const [selectedId, setSelectedId] = useState<string | null>(preselected ?? cohorts[0]?.id ?? null);
  const [fullOverride, setFullOverride] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginLink, setShowLoginLink] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

  // A logged-in customer keeps their session email; a guest is creating the
  // account inline, so the field they typed is the one to confirm back to them.
  const isGuest = !accountEmail;
  const effectiveEmail = accountEmail ?? email.trim();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loginRedirect = encodeURIComponent(
    `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
  );

  const selected = cohorts.find((c) => c.id === selectedId) ?? null;
  const isFull = selected ? fullOverride[selected.id] ?? (selected.availability?.is_full ?? true) : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);

    setShowLoginLink(false);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (isGuest) {
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      if (password.length < 8) {
        setError("Choose a password of at least 8 characters.");
        return;
      }
    }

    const account = isGuest ? { email: email.trim(), password } : {};

    setLoading(true);
    try {
      if (isFull) {
        const res = await fetch("/api/courses/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cohort_id: selected.id, name, phone: phone || undefined, ...account }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.requiresLogin) setShowLoginLink(true);
          setError(data.error || "Something went wrong joining the waitlist. Please try again.");
          return;
        }
        setWaitlisted(true);
      } else {
        const res = await fetch("/api/courses/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cohort_id: selected.id, name, phone: phone || undefined, ...account }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          if (data.requiresLogin) {
            setShowLoginLink(true);
            setError(data.error || "Log in to enroll.");
          } else if (data.full) {
            // Someone else filled the last seat while this page was open,
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
        <p className={`${vulfMono.className} text-sm text-neutral-500 break-words`}>
          We&apos;ll email you at {effectiveEmail} if a seat opens up in the {selected?.label} cohort.
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
          const sharedTime = uniformSessionTime(cohort.sessions);
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
              {sharedTime && (
                <p className={`${vulfMono.className} text-xs text-neutral-500 mb-1`}>{sharedTime}</p>
              )}
              {sharedTime ? (
                // The cohort label already names the weekday, so the dates only
                // need month and day to stay on one line.
                <p className={`${vulfMono.className} text-xs text-neutral-500 mb-3`}>
                  {cohort.sessions.map((s) => formatSessionDateShort(s.session_date)).join(", ")}
                </p>
              ) : (
                // Times differ across this cohort, so each session gets its own
                // row with the time spelled out rather than a tidy summary.
                <ul className={`${vulfMono.className} text-xs text-neutral-500 space-y-1 mb-3`}>
                  {cohort.sessions.map((s) => (
                    <li key={s.id}>
                      {formatSessionDate(s.session_date)},{" "}
                      {formatSessionTime(s.start_time)}–{formatSessionTime(s.end_time)}
                    </li>
                  ))}
                </ul>
              )}
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

          {error && (
            <p className="text-sm text-red-600">
              {error}
              {showLoginLink && (
                <>
                  {" "}
                  <Link href={`/account/login?redirect=${loginRedirect}`} className="underline underline-offset-2 font-semibold">
                    Log in
                  </Link>
                </>
              )}
            </p>
          )}

          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label className={labelCls}>Email</label>
            {isGuest ? (
              <input
                className={inputCls}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            ) : (
              <p className={`${vulfMono.className} text-sm text-neutral-500 break-words px-4 py-3 rounded-lg bg-neutral-50 border border-black/10`}>
                {accountEmail}
              </p>
            )}
          </div>

          {/* Account creation folded into the purchase form: a first-time
              customer never has to think about signing up, they just end up
              with an account they can log back into. */}
          {isGuest && (
            <div>
              <label className={labelCls}>Create a password</label>
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <p className={`${vulfMono.className} text-[11px] text-neutral-400 mt-1`}>
                At least 8 characters. We&apos;ll set up your account so you can manage this
                enrollment later.{" "}
                <Link href={`/account/login?redirect=${loginRedirect}`} className="underline underline-offset-2">
                  Already have an account?
                </Link>
              </p>
            </div>
          )}

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
