"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { vulfMono } from "@/app/fonts";

const schema = z.object({
  name: z.string().min(2, "Tell us your name"),
  email: z.string().email("Enter a valid email"),
  message: z.string().min(5, "Give us a few details"),
  // Honeypot—should remain empty
  company: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ContactPage() {
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

    setSent(true);
    reset();
  }

  return (
    <section className="container-px py-20 max-w-3xl mx-auto text-center">
      <h1 className="h1 mb-2 font-bold">Contact Us</h1>

      {/* Single-line subtitle (scrollable on very small screens) */}
      <p
          className={`${vulfMono.className} mx-auto text-center text-base md:text-lg tracking-[0.12em] md:tracking-[0.18em] text-neutral-800 md:whitespace-nowrap`}>
          OR GIVE US A CALL/TEXT{" "}
          <a href="tel:+18013619066" className="underline-offset-4 hover:underline whitespace-nowrap" aria-label="Call or text (801) 361-9066">
            (801)361–9066
          </a>
        </p>


      {sent ? (
        <p className="mt-8 font-sans bg-green-50 border border-green-200 p-4 rounded-xl">
          Thanks! We’ll get back to you soon.
        </p>
      ) : (
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
              Name
            </label>
            <input
              className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-left">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
              {...register("email")}
            />
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
            <textarea
              rows={5}
              className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
              {...register("message")}
            />
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
      )}
    </section>
  );
}
