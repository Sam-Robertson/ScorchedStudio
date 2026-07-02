"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

type Booking = {
  id: string;
  name: string;
  email: string;
  date: string;
  time_slot: string;
  party_size: number;
  status: string;
  payment_method: string | null;
  amount_paid: number;
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type View = "lookup" | "details" | "reschedule" | "done";
type DoneType = "cancelled" | "rescheduled";

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ManagePageInner />
    </Suspense>
  );
}

function ManagePageInner() {
  const searchParams = useSearchParams();
  const urlBookingId = searchParams.get("booking_id") ?? "";

  const [bookingId, setBookingId] = useState(urlBookingId);
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [editable, setEditable] = useState(false);
  const [view, setView] = useState<View>("lookup");
  const [doneType, setDoneType] = useState<DoneType | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Reschedule state
  const [newDate, setNewDate] = useState("");
  const [newSlot, setNewSlot] = useState("");
  const [newPartySize, setNewPartySize] = useState(1);
  const [rescheduleError, setRescheduleError] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    setBookingId(urlBookingId);
  }, [urlBookingId]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!bookingId.trim() || !email.trim()) {
      setError("Please enter both your booking ID and email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(bookingId.trim())}?email=${encodeURIComponent(email.trim())}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setBooking(json.booking);
      setEditable(json.editable);
      setNewPartySize(json.booking.party_size);
      setView("details");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!booking) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/manage/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to cancel. Please try again.");
        return;
      }
      setDoneType("cancelled");
      setView("done");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!booking) return;
    setRescheduleError("");
    if (!newDate || !newSlot) {
      setRescheduleError("Please select a date and time slot.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/manage/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          email,
          date: newDate,
          time_slot: newSlot,
          party_size: newPartySize,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRescheduleError(json.error ?? "Failed to reschedule. Please try again.");
        return;
      }
      setDoneType("rescheduled");
      setView("done");
    } catch {
      setRescheduleError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!newDate) { setSlots([]); return; }
    setSlotsLoading(true);
    fetch(`/api/bookings/availability?date=${newDate}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => setSlots((data.slots ?? []).map((s: { time: string }) => s.time)))
      .finally(() => setSlotsLoading(false));
  }, [newDate]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16">
        <Container className="max-w-lg">

          {/* ── Lookup ─────────────────────────────────── */}
          {view === "lookup" && (
            <>
              <div className="text-center mb-8">
                <p className="eyebrow text-brand">Bookings</p>
                <h1 className="h2 font-bold">Manage Your Booking</h1>
                <p className={`${vulfMono.className} text-sm text-neutral-500 mt-2`}>
                  Enter your booking ID and email to look up your reservation.
                </p>
              </div>

              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className={`${vulfMono.className} text-xs text-neutral-500 uppercase tracking-wider block mb-1`}>
                    Booking ID
                  </label>
                  <input
                    type="text"
                    value={bookingId}
                    onChange={(e) => setBookingId(e.target.value)}
                    placeholder="e.g. abc123..."
                    className={`${vulfMono.className} w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#519A70]`}
                  />
                </div>
                <div>
                  <label className={`${vulfMono.className} text-xs text-neutral-500 uppercase tracking-wider block mb-1`}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={`${vulfMono.className} w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#519A70]`}
                  />
                </div>

                {error && (
                  <p className={`${vulfMono.className} text-sm text-red-600`}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] text-white py-3 text-sm font-semibold tracking-wide hover:opacity-90 disabled:opacity-50 transition-opacity`}
                >
                  {loading ? "Looking up…" : "Find Booking"}
                </button>
              </form>
            </>
          )}

          {/* ── Details ────────────────────────────────── */}
          {view === "details" && booking && (
            <>
              <div className="text-center mb-8">
                <p className="eyebrow text-brand">Your Reservation</p>
                <h1 className="h2 font-bold">Booking Details</h1>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-6 space-y-3 mb-4">
                <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-2`}>
                  Reservation details
                </p>
                <div className={`${vulfMono.className} text-sm space-y-3`}>
                  <Row label="Name" value={booking.name} />
                  <Row label="Date" value={formatDate(booking.date)} />
                  <Row label="Time" value={booking.time_slot} />
                  <Row label="Party" value={`${booking.party_size} ${booking.party_size === 1 ? "person" : "people"}`} />
                </div>
              </div>

              {!editable && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4">
                  <p className={`${vulfMono.className} text-sm text-amber-800`}>
                    This booking can no longer be modified — the session has already started or passed.
                  </p>
                </div>
              )}

              {error && (
                <p className={`${vulfMono.className} text-sm text-red-600 mb-4`}>{error}</p>
              )}

              {editable && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setView("reschedule")}
                    className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] text-white py-3 text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity`}
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Are you sure you want to cancel this booking?")) {
                        handleCancel();
                      }
                    }}
                    disabled={loading}
                    className={`${vulfMono.className} w-full rounded-xl border border-red-300 text-red-600 py-3 text-sm font-semibold tracking-wide hover:bg-red-50 disabled:opacity-50 transition-colors`}
                  >
                    {loading ? "Cancelling…" : "Cancel Booking"}
                  </button>
                </div>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={() => { setView("lookup"); setBooking(null); setError(""); }}
                  className={`${vulfMono.className} text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
                >
                  Look up a different booking
                </button>
              </div>
            </>
          )}

          {/* ── Reschedule ─────────────────────────────── */}
          {view === "reschedule" && booking && (
            <>
              <div className="text-center mb-8">
                <p className="eyebrow text-brand">Reschedule</p>
                <h1 className="h2 font-bold">Choose a New Time</h1>
                <p className={`${vulfMono.className} text-sm text-neutral-500 mt-2`}>
                  Current: {formatDate(booking.date)} at {booking.time_slot}
                </p>
              </div>

              <form onSubmit={handleReschedule} className="space-y-4">
                <div>
                  <label className={`${vulfMono.className} text-xs text-neutral-500 uppercase tracking-wider block mb-1`}>
                    New Date
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={newDate}
                    onChange={(e) => { setNewDate(e.target.value); setNewSlot(""); }}
                    className={`${vulfMono.className} w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#519A70]`}
                  />
                </div>

                {newDate && slotsLoading && (
                  <p className={`${vulfMono.className} text-sm text-neutral-500`}>Loading times…</p>
                )}

                {newDate && !slotsLoading && slots.length === 0 && (
                  <p className={`${vulfMono.className} text-sm text-neutral-500`}>
                    No time slots available on this date. Please pick another day.
                  </p>
                )}

                {newDate && !slotsLoading && slots.length > 0 && (
                  <div>
                    <label className={`${vulfMono.className} text-xs text-neutral-500 uppercase tracking-wider block mb-1`}>
                      Time Slot
                    </label>
                    <select
                      value={newSlot}
                      onChange={(e) => setNewSlot(e.target.value)}
                      className={`${vulfMono.className} w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#519A70]`}
                    >
                      <option value="">Select a time…</option>
                      {slots.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={`${vulfMono.className} text-xs text-neutral-500 uppercase tracking-wider block mb-1`}>
                    Party Size
                  </label>
                  <select
                    value={newPartySize}
                    onChange={(e) => setNewPartySize(Number(e.target.value))}
                    className={`${vulfMono.className} w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#519A70]`}
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>
                    ))}
                  </select>
                </div>

                {rescheduleError && (
                  <p className={`${vulfMono.className} text-sm text-red-600`}>{rescheduleError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !newDate || !newSlot}
                  className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] text-white py-3 text-sm font-semibold tracking-wide hover:opacity-90 disabled:opacity-50 transition-opacity`}
                >
                  {loading ? "Saving…" : "Confirm Reschedule"}
                </button>

                <button
                  type="button"
                  onClick={() => setView("details")}
                  className={`${vulfMono.className} w-full rounded-xl border border-black/15 py-3 text-sm text-neutral-600 hover:bg-black/5 transition-colors`}
                >
                  Back
                </button>
              </form>
            </>
          )}

          {/* ── Done ───────────────────────────────────── */}
          {view === "done" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#519A70] flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto">
                ✓
              </div>
              <p className="eyebrow text-brand">
                {doneType === "cancelled" ? "Cancelled" : "Updated"}
              </p>
              <h1 className="h2 font-bold mb-3">
                {doneType === "cancelled" ? "Booking Cancelled" : "Booking Rescheduled"}
              </h1>
              <p className={`${vulfMono.className} text-sm text-neutral-500 mb-8`}>
                {doneType === "cancelled"
                  ? "Your reservation has been cancelled. A confirmation email is on its way."
                  : "Your booking has been updated. A confirmation email is on its way."}
              </p>
              <Link
                href="/book"
                className={`${vulfMono.className} inline-block rounded-xl bg-[#519A70] text-white px-6 py-3 text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity`}
              >
                Book Again
              </Link>
              <div className="mt-4">
                <Link href="/" className={`${vulfMono.className} text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
                  Back to home
                </Link>
              </div>
            </div>
          )}

        </Container>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-12 shrink-0">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}
