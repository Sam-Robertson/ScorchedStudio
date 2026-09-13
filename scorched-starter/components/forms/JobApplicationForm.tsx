"use client";

// Inline application form, one per opening on /careers. Posts multipart so the
// resume rides along with the fields; see app/api/careers/apply/route.ts.
import { useRef, useState } from "react";
import clsx from "clsx";
import { vulfMono } from "@/app/fonts";

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

const inputCls =
  "w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";
const labelCls = "block text-xs text-neutral-500 mb-1";

export default function JobApplicationForm({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = new FormData(form);

    const resume = body.get("resume");
    if (resume instanceof File && resume.size > MAX_RESUME_BYTES) {
      setStatus("err");
      setMsg("Resume must be under 4MB.");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong.");
      }
      setStatus("ok");
      setMsg("Thanks! We'll be in touch.");
      form.reset();
      setFileName("");
    } catch (err) {
      setStatus("err");
      setMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-block mt-4 text-sm font-semibold text-brand underline underline-offset-4 hover:opacity-80"
      >
        Apply &rarr;
      </button>
    );
  }

  if (status === "ok") {
    return (
      <p className={`${vulfMono.className} mt-4 text-sm text-[#519A70]`}>{msg}</p>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-5 border-t border-black/10 pt-5 space-y-3">
      <input type="hidden" name="jobTitle" value={jobTitle} />
      <input type="hidden" name="jobId" value={jobId} />
      {/* Honeypot: hidden from people, catnip for bots. */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor={`name-${jobId}`}>Name</label>
          <input id={`name-${jobId}`} name="name" required minLength={2} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`email-${jobId}`}>Email</label>
          <input id={`email-${jobId}`} name="email" type="email" required className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor={`phone-${jobId}`}>Phone (optional)</label>
        <input id={`phone-${jobId}`} name="phone" className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor={`resume-${jobId}`}>Resume (PDF or Word, under 4MB)</label>
        <input
          id={`resume-${jobId}`}
          name="resume"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border file:border-black/20 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-50"
        />
        {fileName && (
          <p className={`${vulfMono.className} mt-1 text-[11px] text-neutral-400 truncate`}>{fileName}</p>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor={`message-${jobId}`}>Anything else? (optional)</label>
        <textarea id={`message-${jobId}`} name="message" rows={3} className={clsx(inputCls, "resize-none")} />
      </div>

      {status === "err" && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "sending"}
          className={`${vulfMono.className} rounded-lg bg-green px-5 py-2 text-sm font-semibold tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
        >
          {status === "sending" ? "Sending…" : "Submit application"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setStatus("idle"); setMsg(""); }}
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
