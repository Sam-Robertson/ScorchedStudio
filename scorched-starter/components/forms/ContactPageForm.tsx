"use client";

// The /contact form. The page itself is a server component so it can load
// the studio list; this is the interactive part.
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import type { LocationOption } from "@/lib/locations";
import { trackContactSubmitted } from "@/lib/analytics";

const schema = z.object({
  location: z.enum(["orem", "slc"], { message: "Pick a studio" }),
  name: z.string().min(2, "Tell us your name"),
  email: z.string().email("Enter a valid email"),
  message: z.string().min(5, "Give us a few details"),
  // Honeypot, should remain empty
  company: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputCls =
  "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

export default function ContactPageForm({ locations }: { locations: LocationOption[] }) {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: values.location,
        name: values.name,
        email: values.email,
        message: values.message,
        company: values.company ?? "",
      }),
    });

    if (!res.ok) {
      setServerError(
        "Something went wrong sending your message. Please try again."
      );
      return;
    }

    trackContactSubmitted({ studio: values.location, source: "contact" });
    setSent(true);
    reset();
  }

  if (sent) {
    return (
      <p className="mt-8 font-sans bg-green-50 border border-green-200 p-4 rounded-xl">
        Thanks! We’ll get back to you soon.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-8 space-y-5 text-left"
    >
      {/* Honeypot (hidden) */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        {...register("company")}
      />

      <div>
        <label className="block text-sm font-medium mb-1 text-left">
          Which studio?
        </label>
        <select className={inputCls} defaultValue="" {...register("location")}>
          <option value="" disabled>
            Pick a studio
          </option>
          {locations.map((loc) => (
            <option key={loc.key} value={loc.key}>
              {loc.name}
            </option>
          ))}
        </select>
        {errors.location && (
          <p className="text-sm text-red-600 mt-1">{errors.location.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-left">
          Name
        </label>
        <input className={inputCls} {...register("name")} />
        {errors.name && (
          <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-left">
          Email
        </label>
        <input type="email" className={inputCls} {...register("email")} />
        {errors.email && (
          <p className="text-sm text-red-600 mt-1">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-left">
          Message
        </label>
        <textarea rows={5} className={inputCls} {...register("message")} />
        {errors.message && (
          <p className="text-sm text-red-600 mt-1">
            {errors.message.message}
          </p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-red-600">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`${vulfMono.className} w-full rounded-xl bg-green py-4 text-sm md:text-base tracking-[0.25em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
      >
        {isSubmitting ? "Sending…" : "SEND CARRIER PIGEON"}
      </button>
    </form>
  );
}
