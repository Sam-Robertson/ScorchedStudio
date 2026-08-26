"use client";

import { useState } from "react";
import { formatDenverDate } from "@/lib/timezone";

export default function CancelMembershipButton({ membershipId }: { membershipId: string }) {
  const [state, setState] = useState<"idle" | "confirming" | "done">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/account/membership/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membership_id: membershipId }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Failed to cancel membership.");
      return;
    }
    setPeriodEnd(data.current_period_end ?? null);
    setState("done");
  }

  if (state === "done") {
    return (
      <p className="text-xs text-neutral-500">
        Cancellation scheduled{periodEnd ? ` — you'll keep access through ${formatDenverDate(periodEnd)}` : ""}, and you won&apos;t be charged again.
      </p>
    );
  }

  if (state === "confirming") {
    return (
      <div className="space-y-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-xs text-neutral-500">
          You&apos;ll keep access through the end of your current billing period, then it won&apos;t renew. Continue?
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-red-600 text-white text-xs font-semibold px-3 py-2 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Canceling…" : "Yes, cancel"}
          </button>
          <button
            onClick={() => setState("idle")}
            disabled={submitting}
            className="rounded-lg border border-black/20 text-xs px-3 py-2 hover:bg-neutral-50 disabled:opacity-50"
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState("confirming")}
      className="text-xs text-red-600 underline underline-offset-2 hover:opacity-80"
    >
      Cancel membership
    </button>
  );
}
