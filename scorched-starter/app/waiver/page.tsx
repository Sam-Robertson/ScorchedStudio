"use client";

// app/waiver/page.tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { vulfMono } from "@/app/fonts";
import SignatureCanvas, { SignatureCanvasRef } from "@/components/ui/SignatureCanvas";
import Image from "next/image";
import { MessageSquare, Plus, X } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  agreed: z.boolean().refine((v) => v === true, "You must agree to the waiver"),
});

type FormValues = z.infer<typeof schema>;

type Minor = { firstName: string; lastName: string; dateOfBirth: string };

const inputCls =
  "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";
const labelCls = "block text-sm font-medium mb-1";
const errorCls = "text-sm text-red-600 mt-1";

export default function WaiverPage() {
  const sigRef = useRef<SignatureCanvasRef>(null);
  const [sigError, setSigError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [minors, setMinors] = useState<Minor[]>([]);
  const [minorErrors, setMinorErrors] = useState<string | null>(null);

  // Per-kiosk URL, e.g. /waiver?location=slc — defaults to Orem so existing
  // bookmarked kiosks with no query param keep working unchanged.
  const [location, setLocation] = useState<"orem" | "slc">("orem");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("location") === "slc") setLocation("slc");
  }, []);

  function addMinor() {
    setMinors((prev) => [...prev, { firstName: "", lastName: "", dateOfBirth: "" }]);
  }

  function removeMinor(i: number) {
    setMinors((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateMinor(i: number, field: keyof Minor, value: string) {
    setMinors((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const clearSigError = useCallback(() => setSigError(null), []);

  async function onSubmit(values: FormValues) {
    // Validate minors — all fields required if a minor was added
    const incomplete = minors.some(
      (m) => !m.firstName.trim() || !m.lastName.trim() || !m.dateOfBirth
    );
    if (incomplete) {
      setMinorErrors("Please fill in all fields for each minor.");
      return;
    }
    setMinorErrors(null);

    const signatureData = sigRef.current?.getData();
    if (!signatureData) {
      setSigError("Please sign before submitting.");
      return;
    }
    setSigError(null);
    setServerError(null);

    const res = await fetch("/api/waiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone ?? "",
        dateOfBirth: values.dateOfBirth,
        signatureData,
        minors: minors.length > 0 ? minors : [],
        location,
      }),
    });

    if (!res.ok) {
      setServerError("Something went wrong. Please try again.");
      return;
    }

    setSubmittedName(values.firstName);
    setSubmittedEmail(values.email);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <section className="container-px py-12 max-w-2xl mx-auto text-center">
        {/* Confirmation */}
        <div className="rounded-2xl border border-green bg-white p-8 shadow-sm">
          <p className="eyebrow text-brand mb-3">All set!</p>
          <h1 className="h2 font-bold mb-4">Waiver Signed</h1>
          <p className={`${vulfMono.className} text-[15px] leading-[1.6] text-neutral-700`}>
            Thanks, {submittedName}! Your waiver is on file. You&apos;re ready
            to burn — we&apos;ll see you soon.
          </p>
          <p className={`${vulfMono.className} mt-3 text-sm text-neutral-500`}>
            A confirmation has been sent to {submittedEmail}.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setSubmittedName("");
              setSubmittedEmail("");
              setSigError(null);
              setServerError(null);
              setMinors([]);
              setMinorErrors(null);
              reset();
              sigRef.current?.clear();
            }}
            className={`${vulfMono.className} mt-5 text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
          >
            Fill out another waiver
          </button>
        </div>

        {/* VIP sign-up */}
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
          <p className="eyebrow text-brand mb-2">While you&apos;re here</p>
          <h2 className="h2 font-bold mb-3">Join Scorched VIP</h2>
          <p className={`${vulfMono.className} text-[14px] leading-[1.6] text-neutral-600 max-w-sm mx-auto mb-6`}>
            Free to join. Get exclusive deals, hear about new products first, and pick up a free wooden ring on your next visit.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* QR */}
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-5 flex flex-col items-center text-center">
              <p className="eyebrow text-brand mb-3">In Studio</p>
              <Image
                src="/loyalty-qr.png"
                alt="Scorched VIP sign-up QR code"
                width={110}
                height={110}
                className="rounded-xl"
              />
              <p className={`${vulfMono.className} mt-3 text-[13px] text-neutral-600`}>
                Scan the QR code at the front desk
              </p>
            </div>

            {/* Text */}
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-5 flex flex-col items-center text-center">
              <p className="eyebrow text-brand mb-3">From Anywhere</p>
              <div className="w-[110px] h-[110px] rounded-xl bg-blush flex flex-col items-center justify-center gap-1">
                <MessageSquare className="w-7 h-7 text-brand" />
                <p className={`${vulfMono.className} text-lg font-bold text-brand`}>Text Us</p>
              </div>
              <p className={`${vulfMono.className} mt-3 text-[13px] text-neutral-600`}>
                Text <span className="font-bold text-brand">BURN</span> to{" "}
                <span className="font-bold text-brand">(844) 952-0456</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container-px py-12 max-w-2xl mx-auto">
      <p className="eyebrow text-brand">Required before your first visit</p>
      <h1 className="h1 font-bold mt-1 mb-6">Studio Waiver</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Name row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First Name</label>
            <input className={inputCls} {...register("firstName")} />
            {errors.firstName && <p className={errorCls}>{errors.firstName.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input className={inputCls} {...register("lastName")} />
            {errors.lastName && <p className={errorCls}>{errors.lastName.message}</p>}
          </div>
        </div>

        {/* Email + Phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} {...register("email")} />
            {errors.email && <p className={errorCls}>{errors.email.message}</p>}
          </div>
          <div>
            <label className={labelCls}>Phone <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input type="tel" className={inputCls} {...register("phone")} />
          </div>
        </div>

        {/* DOB */}
        <div className="max-w-xs">
          <label className={labelCls}>Date of Birth</label>
          <input type="date" className={inputCls} {...register("dateOfBirth")} />
          {errors.dateOfBirth && <p className={errorCls}>{errors.dateOfBirth.message}</p>}
        </div>

        {/* Minor participants */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="h3 font-bold">Minor Participants</h2>
              <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                Optional — your signature below covers any minors listed here.
              </p>
            </div>
            <button
              type="button"
              onClick={addMinor}
              className={`${vulfMono.className} flex items-center gap-1.5 text-sm text-[#519A70] hover:opacity-75 transition-opacity shrink-0 ml-4`}
            >
              <Plus className="w-4 h-4" />
              Add minor
            </button>
          </div>

          {minors.length > 0 && (
            <div className="space-y-3 mt-3">
              {minors.map((minor, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-black/10 bg-neutral-50 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className={`${vulfMono.className} text-xs font-bold text-neutral-400 uppercase tracking-wide`}>
                      Minor {i + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeMinor(i)}
                      className="text-neutral-400 hover:text-neutral-700 transition-colors"
                      aria-label="Remove minor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">First Name</label>
                      <input
                        className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
                        value={minor.firstName}
                        onChange={(e) => updateMinor(i, "firstName", e.target.value)}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Last Name</label>
                      <input
                        className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
                        value={minor.lastName}
                        onChange={(e) => updateMinor(i, "lastName", e.target.value)}
                        placeholder="Last name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Date of Birth</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40"
                        value={minor.dateOfBirth}
                        onChange={(e) => updateMinor(i, "dateOfBirth", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {minorErrors && <p className="text-sm text-red-600 mt-2">{minorErrors}</p>}
        </div>

        {/* Waiver text */}
        <div>
          <h2 className="h3 font-bold mb-3">Waiver Agreement</h2>
          <div
            className={`${vulfMono.className} h-64 overflow-y-auto rounded-xl border border-black/15 bg-white p-5 text-[13px] leading-[1.7] text-neutral-700 space-y-4`}
          >
            <p className="font-bold text-sm uppercase tracking-wide">
              Scorched Studio — Participant Waiver &amp; Release of Liability
            </p>

            <p>
              <strong>1. Assumption of Risk</strong><br />
              I understand that woodburning (pyrography) involves the use of electrically
              heated tools that reach temperatures in excess of 900°F. I voluntarily
              assume all risks associated with participation, including but not limited to:
              burns from hot tools or materials, cuts or abrasions, inhalation of smoke or
              fumes from burning wood, eye irritation, and potential property damage.
            </p>

            <p>
              <strong>2. Studio Rules &amp; Equipment Use</strong><br />
              I agree to follow all posted safety rules and any instructions given by
              Scorched Studio staff. I will not use any equipment without proper
              orientation. I will keep my workspace clean and immediately notify a staff
              member of any safety hazard or injury.
            </p>

            <p>
              <strong>3. Minors &amp; Supervision</strong><br />
              Participants under the age of 18 must be accompanied and supervised by a
              parent or legal guardian at all times. By signing this waiver I confirm that
              I am 18 years of age or older, OR that I am the parent or legal guardian
              signing on behalf of a minor participant.
            </p>

            <p>
              <strong>4. Medical Conditions</strong><br />
              I confirm that I have no medical conditions—including but not limited to
              respiratory conditions, burns, or open wounds—that would be aggravated by
              participation in woodburning activities. I agree to disclose any relevant
              health conditions to staff prior to beginning.
            </p>

            <p>
              <strong>5. Release of Liability</strong><br />
              To the fullest extent permitted by applicable law, I hereby release, waive,
              discharge, and covenant not to sue Scorched Studio LLC, its owners,
              managers, employees, volunteers, and agents from any and all liability,
              claims, demands, actions, or causes of action arising out of or relating to
              any loss, damage, injury, or death resulting from my participation in
              activities at Scorched Studio, whether caused by the negligence of Scorched
              Studio or otherwise.
            </p>

            <p>
              <strong>6. Personal Property</strong><br />
              I understand that Scorched Studio is not responsible for loss, theft, or
              damage to personal belongings brought onto the premises.
            </p>

            <p>
              <strong>7. Indemnification</strong><br />
              I agree to indemnify and hold harmless Scorched Studio and its staff from
              any claims, costs, or expenses (including reasonable attorney fees) arising
              from my participation or the participation of any minor for whom I am
              responsible.
            </p>

            <p className="text-xs text-neutral-500">
              This waiver is binding upon me, my heirs, executors, administrators, and
              assigns. I have read this document in full, understand its terms, and sign
              it voluntarily.
            </p>
          </div>
        </div>

        {/* Agree checkbox */}
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-black/20 accent-[#519A70]"
              {...register("agreed")}
            />
            <span className={`${vulfMono.className} text-[14px] leading-[1.6] text-neutral-800`}>
              I have read, understood, and agree to the waiver and release of liability above.
            </span>
          </label>
          {errors.agreed && <p className={errorCls}>{errors.agreed.message}</p>}
        </div>

        {/* Signature */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={`${labelCls} mb-0`}>Signature</label>
            <button
              type="button"
              onClick={() => {
                sigRef.current?.clear();
                setSigError(null);
              }}
              className={`${vulfMono.className} text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800`}
            >
              Clear
            </button>
          </div>
          <div className="rounded-xl border-2 border-dashed border-black/20 bg-white overflow-hidden">
            <SignatureCanvas
              ref={sigRef}
              onDraw={clearSigError}
              className="w-full h-36 md:h-44 block"
            />
          </div>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
            Draw your signature above using your mouse or finger.
          </p>
          {sigError && <p className={errorCls}>{sigError}</p>}
        </div>

        {serverError && <p className={errorCls}>{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-4 text-sm md:text-base tracking-[0.25em] text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity`}
        >
          {isSubmitting ? "Submitting…" : "SIGN & SUBMIT"}
        </button>
      </form>
    </section>
  );
}
