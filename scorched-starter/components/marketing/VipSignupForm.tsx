"use client";

// The Scorched VIP sign-up form on /scorched-vip.
//
// The two checkboxes are the shared MarketingOptIns component, so the wording
// here is byte-identical to the waiver, the booking checkout, and the account
// page, and to the sentence the 10DLC registration quotes. Neither box is ever
// pre-ticked. Joining needs at least one of them; the text box is never the
// required one, so nobody has to agree to texts to become a member.
import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import MarketingOptIns, { EMPTY_OPT_INS, type OptInState } from "@/components/marketing/MarketingOptIns";

const inputCls =
  "w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#884A20] transition-colors";

export default function VipSignupForm() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [optIns, setOptIns] = useState<OptInState>(EMPTY_OPT_INS);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  function fail(text: string) {
    setMessage(text);
    setStatus("error");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return fail("Enter a valid email address.");
    }
    if (!optIns.email && !optIns.sms) {
      return fail("Tick at least one box so we know how to reach you.");
    }
    if (optIns.sms && !phone.trim()) {
      return fail("Add a mobile number so we know where to text you.");
    }

    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/vip-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          email: email.trim(),
          // Only sent with the text box ticked, so a number typed next to an
          // unticked box never leaves the page.
          phone: optIns.sms ? phone.trim() : undefined,
          emailOptIn: optIns.email,
          smsOptIn: optIns.sms,
          company,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "");
      setStatus("done");
    } catch (err) {
      fail(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-3xl border border-green bg-white p-6 md:p-8 shadow-sm text-center">
        <p className="eyebrow text-brand mb-2">You&apos;re in</p>
        <h2 className="h3 font-bold">Welcome to Scorched VIP</h2>
        <p className={`${vulfMono.className} mt-3 text-[14px] leading-[1.6] text-neutral-700`}>
          Thanks{firstName.trim() ? `, ${firstName.trim()}` : ""}! Come pick up your free wooden ring
          on your next visit. We will be in touch when there is a deal or something new worth
          hearing about.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-3xl border border-green bg-white p-6 md:p-8 shadow-sm space-y-5"
    >
      <div className="text-center">
        <h2 className="h3 font-bold">Sign Up</h2>
        <p className={`${vulfMono.className} mt-2 text-[14px] leading-[1.6] text-neutral-600`}>
          Choose email, texts, or both.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="vip-first-name" className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>
            First name <span className="text-neutral-300">(optional)</span>
          </label>
          <input
            id="vip-first-name"
            type="text"
            autoComplete="given-name"
            className={inputCls}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
          />
        </div>
        <div>
          <label htmlFor="vip-email" className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>
            Email <span className="text-red-400">*</span>
          </label>
          <input
            id="vip-email"
            type="email"
            autoComplete="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="vip-phone" className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>
          Mobile number <span className="text-neutral-300">(only if you want texts)</span>
        </label>
        <input
          id="vip-phone"
          type="tel"
          autoComplete="tel"
          className={inputCls}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(801) 555-0100"
        />
      </div>

      <input
        type="text"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {/* Unticked by default. At least one is needed to join. */}
      <div className="rounded-xl border border-black/10 bg-neutral-50 p-4">
        <p className={`${vulfMono.className} text-xs tracking-[0.15em] uppercase text-neutral-500 mb-3`}>
          How should we reach you?
        </p>
        <MarketingOptIns value={optIns} onChange={setOptIns} idPrefix="vip-optin" />
      </div>

      {status === "error" && message && (
        <p role="alert" className={`${vulfMono.className} text-xs text-red-500`}>
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className={`${vulfMono.className} w-full rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60`}
      >
        {status === "loading" ? "JOINING…" : "JOIN SCORCHED VIP"}
      </button>
    </form>
  );
}
