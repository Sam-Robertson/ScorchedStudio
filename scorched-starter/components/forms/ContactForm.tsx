// components/forms/GroupContactForm.tsx
"use client";

import { useState } from "react";
import clsx from "clsx";

export default function GroupContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          groupSize: data.groupSize,
          date: data.date,
          message: data.message,
          source: "group-events",
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      setStatus("ok");
      setMsg("Thanks! We’ll be in touch shortly.");
      form.reset();
    } catch (err) {
      console.error(err);
      setStatus("err");
      setMsg("Something went wrong. Please try again or email us directly.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Text name="name" label="Name" required autoComplete="name" />
      <Text name="email" label="Email" type="email" required autoComplete="email" />
      <Text name="phone" label="Phone" autoComplete="tel" />
      <Text name="groupSize" label="Estimated Group Size" />
      <Text name="date" label="Preferred Date" type="date" />

      <div className="md:col-span-2">
        <Label htmlFor="message">Tell us about your event</Label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-green/60 focus:ring-2 focus:ring-green/30"
          placeholder="Who’s coming, ideal timing, any special needs, etc."
        />
      </div>

      {/* Full-width footer */}
      <div className="md:col-span-2 mt-6 space-y-2">
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold tracking-[0.18em] bg-green text-white shadow-sm hover:opacity-95 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green"
        >
          {status === "sending" ? "Sending…" : "Send carrier pigeon"}
        </button>
        <p
          className={clsx("text-center text-sm", status === "err" ? "text-red-600" : "text-neutral-600")}
          aria-live="polite"
        >
          {msg}
        </p>
      </div>
    </form>
  );
}

function Text({
  name,
  label,
  type = "text",
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>
        {label}
        {required ? " *" : ""}
      </Label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-green/60 focus:ring-2 focus:ring-green/30"
      />
    </div>
  );
}

function Label(props: React.ComponentProps<"label">) {
  return <label {...props} className="block text-sm font-medium" />;
}
