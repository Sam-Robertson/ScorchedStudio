"use client";

// Marketing preferences on the signed-in account page.
//
// The checkbox wording is the shared constant every other opt-in point uses, so
// what someone agrees to here is byte-identical to the waiver and the booking
// checkout. That matters beyond tidiness: the 10DLC registration quotes that
// exact sentence, and a carrier reviewer can open any of the three and compare.
//
// Unlike the other two, this page knows who you are, so it shows your current
// setting rather than an empty box. Turning something off here is as much a
// consent event as turning it on, and both are written to the log.
import { useEffect, useState } from "react";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import {
  EMAIL_CONSENT_TEXT,
  SMS_CONSENT_TEXT,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
} from "@/lib/marketing/consent-copy";

type Prefs = {
  emailOptedIn: boolean;
  smsOptedIn: boolean;
  phone: string | null;
  emailBlocked: boolean;
};

export default function MarketingPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [email, setEmail] = useState(false);
  const [sms, setSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/marketing");
        if (!res.ok) throw new Error();
        const body: Prefs = await res.json();
        setPrefs(body);
        setEmail(body.emailOptedIn);
        setSms(body.smsOptedIn);
        setStatus("idle");
      } catch {
        setStatus("error");
        setMessage("Could not load your preferences.");
      }
    })();
  }, []);

  const dirty =
    prefs !== null && (email !== prefs.emailOptedIn || sms !== prefs.smsOptedIn || phone.trim() !== "");

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/account/marketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOptIn: email, smsOptIn: sms, phone: phone.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save your preferences.");

      setPrefs(body);
      setEmail(body.emailOptedIn);
      setSms(body.smsOptedIn);
      setPhone("");
      setStatus("saved");
      setMessage("Saved.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not save your preferences.");
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-neutral-400">Loading your preferences…</p>;
  }

  const boxCls = "mt-0.5 h-4 w-4 shrink-0 accent-[#884A20]";
  const labelCls = "text-xs leading-relaxed text-neutral-600";

  return (
    <div className="rounded-xl border border-black/10 p-4 space-y-3">
      <label htmlFor="acct-email-optin" className="flex items-start gap-2 cursor-pointer">
        <input
          id="acct-email-optin"
          type="checkbox"
          checked={email}
          disabled={prefs?.emailBlocked}
          onChange={(e) => setEmail(e.target.checked)}
          className={boxCls}
        />
        <span className={labelCls}>{EMAIL_CONSENT_TEXT}</span>
      </label>

      {prefs?.emailBlocked && (
        // Turning this back on from here would not work: the address bounced or
        // was reported as spam, and the provider suppresses it. Saying so beats
        // a checkbox that silently does nothing.
        <p className="text-xs text-amber-600 ml-6">
          We stopped emailing this address because a message bounced or was marked as spam. Email{" "}
          <a href="mailto:contact@scorchedstudio.com" className="underline">
            contact@scorchedstudio.com
          </a>{" "}
          and we will sort it out.
        </p>
      )}

      <label htmlFor="acct-sms-optin" className="flex items-start gap-2 cursor-pointer">
        <input
          id="acct-sms-optin"
          type="checkbox"
          checked={sms}
          onChange={(e) => setSms(e.target.checked)}
          className={boxCls}
        />
        <span className={labelCls}>
          {SMS_CONSENT_TEXT}{" "}
          <Link href={PRIVACY_POLICY_PATH} className="underline hover:text-neutral-900">
            Privacy Policy
          </Link>
          {" and "}
          <Link href={TERMS_PATH} className="underline hover:text-neutral-900">
            Terms
          </Link>
          .
        </span>
      </label>

      {sms && (
        <div className="ml-6">
          {prefs?.phone && !phone ? (
            <p className="text-xs text-neutral-500">
              We will text <span className="font-medium">{prefs.phone}</span>.{" "}
              <button
                type="button"
                onClick={() => setPhone(prefs.phone ?? "")}
                className="underline hover:text-neutral-900"
              >
                Use a different number
              </button>
            </p>
          ) : (
            <input
              type="tel"
              placeholder="(801) 555-0123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full max-w-xs"
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={!dirty || status === "saving"}
          className={`${vulfMono.className} rounded-lg bg-[#884A20] px-4 py-2 text-xs font-semibold tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40`}
        >
          {status === "saving" ? "SAVING…" : "SAVE"}
        </button>
        {message && (
          <span className={`text-xs ${status === "error" ? "text-red-500" : "text-neutral-500"}`}>
            {message}
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        Booking confirmations, waiver copies, and receipts are not marketing and keep arriving
        either way.
      </p>
    </div>
  );
}
