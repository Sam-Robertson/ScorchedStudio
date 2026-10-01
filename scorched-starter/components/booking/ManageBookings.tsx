"use client";

// components/booking/ManageBookings.tsx
//
// Everything a customer can do to a booking they already have: change the
// date, time, or party size, pay for a reservation they made without paying,
// mark it as a gift card visit, or cancel. On a card-paid booking a bigger
// party pays the difference and a smaller one is refunded it. Rendered by the Manage tab on /book
// and by /book/manage, which is where the emailed "Edit your booking" link
// lands.
//
// A booking is reached one of two ways, and each carries its own proof for the
// API: a signed link from an email (token), or looking up by the email address
// used to book. There is no booking id to type.
import { useEffect, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { vulfMono } from "@/app/fonts";
import {
  MAX_PARTY_SIZE,
  PRICE_PER_PERSON,
  amountDueCents,
  canPayOnline,
  isBookingEditable,
  isUnpaidReservation,
  refundDueCents,
} from "@/lib/booking-rules";
import {
  Calendar,
  PaymentBadge,
  PaymentForm,
  SlotGrid,
  calMonthForDate,
  formatDateLong,
  formatDateShort,
  inputCls,
  partyLabel,
  stripeAppearance,
  stripePromise,
  type ManagedBooking,
  type SlotInfo,
} from "./shared";

type Screen = "loading" | "lookup" | "list" | "edit" | "pay";
type PayChoice = "studio" | "gift_card" | "card";
type Proof = { token: string } | { email: string };

const LOCATION_NAMES: Record<string, string> = { orem: "Orem", slc: "Salt Lake City" };

function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export default function ManageBookings({
  initialBookingId,
  initialToken,
  onBookNew,
}: {
  // From an emailed link. With both, the booking opens without any typing.
  initialBookingId?: string;
  initialToken?: string;
  onBookNew: () => void;
}) {
  const hasLink = !!(initialBookingId && initialToken);

  const [screen, setScreen] = useState<Screen>(hasLink ? "loading" : "lookup");
  const [email, setEmail] = useState("");
  const [viaLink, setViaLink] = useState(false);
  const [bookings, setBookings] = useState<ManagedBooking[]>([]);
  const [notice, setNotice] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [payStartingId, setPayStartingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedBooking | null>(null);
  const [paying, setPaying] = useState<{ booking: ManagedBooking; clientSecret: string; amount: number } | null>(null);

  function proofFor(b: ManagedBooking): Proof {
    return b.token ? { token: b.token } : { email };
  }

  // Emailed link: load that one booking straight away.
  useEffect(() => {
    if (!initialBookingId || !initialToken) return;
    let stale = false;
    fetch(`/api/bookings/manage/${encodeURIComponent(initialBookingId)}?t=${encodeURIComponent(initialToken)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (stale) return;
        if (!ok) {
          setLookupError(
            data.error === "This booking has already been cancelled."
              ? "That booking has been cancelled. You can look up your other bookings with your email."
              : "We couldn't open that link. Look up your booking with your email instead."
          );
          setScreen("lookup");
          return;
        }
        setBookings([{ ...data.booking, token: initialToken }]);
        setViaLink(true);
        setScreen("list");
      })
      .catch(() => {
        if (stale) return;
        setLookupError("We couldn't open that link. Look up your booking with your email instead.");
        setScreen("lookup");
      });
    return () => { stale = true; };
  }, [initialBookingId, initialToken]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const res = await fetch(`/api/bookings/manage?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) { setLookupError(data.error || "Something went wrong."); setLookupLoading(false); return; }
      setBookings(data.bookings ?? []);
      setViaLink(false);
      setNotice("");
      setScreen("list");
    } catch {
      setLookupError("Something went wrong. Please try again.");
    }
    setLookupLoading(false);
  }

  function replaceBooking(updated: ManagedBooking) {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  async function handleCancel(b: ManagedBooking) {
    setCancelLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/bookings/manage/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", ...proofFor(b) }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || "Failed to cancel."); setCancelLoading(false); return; }
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      setConfirmCancelId(null);
      setNotice(
        data.refunded
          ? `Booking cancelled. Your refund of ${dollars(data.amount_refunded ?? b.amount_paid)} is on its way and usually shows up within 5 to 10 business days.`
          : "Booking cancelled. A confirmation email is on its way."
      );
    } catch {
      setActionError("Something went wrong. Please try again.");
    }
    setCancelLoading(false);
  }

  function startEdit(b: ManagedBooking) {
    setEditing(b);
    setNotice("");
    setActionError("");
    setScreen("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // "Pay now" on the list skips the edit screen: nothing about the booking is
  // changing, so it goes straight to the card form.
  async function startPayment(b: ManagedBooking) {
    setPayStartingId(b.id);
    setActionError("");
    try {
      const res = await fetch(`/api/bookings/manage/${b.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proofFor(b)),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || "Couldn't start the payment."); setPayStartingId(null); return; }
      showPayment(b, data.clientSecret, data.amount);
    } catch {
      setActionError("Something went wrong. Please try again.");
    }
    setPayStartingId(null);
  }

  function showPayment(b: ManagedBooking, clientSecret: string, amount: number) {
    setPaying({ booking: b, clientSecret, amount });
    setNotice("");
    setScreen("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePaid() {
    if (!paying) return;
    replaceBooking({ ...paying.booking, amount_paid: paying.booking.amount_paid + paying.amount, payment_method: "stripe" });
    setPaying(null);
    setNotice("Payment received. You're all paid up, and a receipt is on its way to your email.");
    setScreen("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Loading (emailed link) ──────────────────────────────────────────────────
  if (screen === "loading") {
    return <p className={`${vulfMono.className} text-sm text-neutral-400 py-10 text-center`}>Loading your booking…</p>;
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────
  if (screen === "lookup") {
    return (
      <form onSubmit={handleLookup} className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Find your booking</p>
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Email address used when booking</label>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoFocus required />
        </div>
        {lookupError && <p className={`${vulfMono.className} text-xs text-red-500`}>{lookupError}</p>}
        <button type="submit" disabled={lookupLoading} className={`${vulfMono.className} w-full rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60`}>
          {lookupLoading ? "Looking up…" : "FIND MY BOOKINGS"}
        </button>
        <p className={`${vulfMono.className} text-xs text-neutral-400`}>
          Tip: the &ldquo;Edit your booking&rdquo; button in your confirmation email opens your booking directly.
        </p>
      </form>
    );
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  if (screen === "edit" && editing) {
    return (
      <EditBooking
        booking={editing}
        proof={proofFor(editing)}
        onUpdated={(b) => { replaceBooking(b); setEditing(b); }}
        onStartPayment={showPayment}
        onDone={(message) => { setNotice(message); setScreen("list"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onBack={() => setScreen("list")}
      />
    );
  }

  // ── Pay ─────────────────────────────────────────────────────────────────────
  if (screen === "pay" && paying) {
    const b = paying.booking;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-3`}>Paying for your booking</p>
          <div className={`${vulfMono.className} text-sm`}>
            <p className="font-bold text-base">{formatDateLong(b.date)}</p>
            <p className="text-neutral-500 mt-0.5">{b.time_slot} · {partyLabel(b.party_size)}</p>
            <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between font-bold">
              <span>Total</span><span className="text-lg">{dollars(paying.amount)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-4`}>Card details</p>
          <Elements stripe={stripePromise} options={{ clientSecret: paying.clientSecret, appearance: stripeAppearance }}>
            <PaymentForm total={paying.amount / 100} onSuccess={handlePaid} />
          </Elements>
        </div>
        <button onClick={() => { setPaying(null); setScreen("list"); }} className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
          ← Pay later instead
        </button>
      </div>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={`${vulfMono.className} text-sm text-neutral-500 break-words min-w-0`}>
          {viaLink ? "Your booking" : <>Upcoming bookings for <span className="text-neutral-800 font-medium">{email}</span></>}
        </p>
        <button
          onClick={() => { setScreen("lookup"); setActionError(""); setLookupError(""); setNotice(""); }}
          className={`${vulfMono.className} shrink-0 text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
        >
          {viaLink ? "Find another booking" : "Different email"}
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-[#519A70]/40 bg-[#519A70]/10 px-5 py-4">
          <p className={`${vulfMono.className} text-sm text-[#2f6b49]`}>{notice}</p>
        </div>
      )}

      {bookings.length === 0 && (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
          <p className={`${vulfMono.className} text-sm text-neutral-400`}>
            {viaLink ? "No upcoming booking here." : "No upcoming bookings found for this email."}
          </p>
          <button onClick={onBookNew} className={`${vulfMono.className} inline-block mt-4 text-sm underline text-[#884A20] underline-offset-2`}>
            Book a session →
          </button>
        </div>
      )}

      {bookings.map((b) => {
        const editable = isBookingEditable(b.date, b.time_slot);
        const unpaid = isUnpaidReservation(b);
        const payable = canPayOnline(b);
        const due = amountDueCents(b);
        const isConfirmingCancel = confirmCancelId === b.id;
        return (
          <div key={b.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
            <div className={`${vulfMono.className} text-sm`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-base">{formatDateLong(b.date)}</p>
                  <p className="text-neutral-500 mt-0.5">
                    {b.time_slot} · {partyLabel(b.party_size)} · {LOCATION_NAMES[b.location] ?? "Orem"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PaymentBadge method={b.payment_method} />
                  {!editable && <span className="text-[11px] text-neutral-300">Past</span>}
                </div>
              </div>
              <p className="text-xs mt-2">
                {b.amount_paid > 0 && due > 0 ? (
                  <span className="text-amber-600">Paid {dollars(b.amount_paid)} · {dollars(due)} still due for added guests</span>
                ) : b.amount_paid > 0 ? (
                  <span className="text-[#519A70]">Paid {dollars(b.amount_paid)}</span>
                ) : b.payment_method === "gift_card" ? (
                  <span className="text-neutral-500">Bring your gift card. The ${PRICE_PER_PERSON} per person studio fee is collected in studio.</span>
                ) : unpaid ? (
                  <span className="text-amber-600">Not paid yet · {dollars(due)} due in studio, or pay now</span>
                ) : null}
              </p>
            </div>

            {editable && !isConfirmingCancel && (
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-black/5">
                {payable && (
                  <button
                    onClick={() => startPayment(b)}
                    disabled={payStartingId !== null}
                    className={`${vulfMono.className} col-span-2 rounded-xl bg-[#519A70] py-2.5 text-xs font-semibold tracking-wide text-white hover:opacity-90 disabled:opacity-60`}
                  >
                    {payStartingId === b.id ? "Loading…" : `Pay now · ${dollars(due)}`}
                  </button>
                )}
                <button onClick={() => startEdit(b)} className={`${vulfMono.className} rounded-xl border border-black/20 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50`}>Edit booking</button>
                <button onClick={() => { setConfirmCancelId(b.id); setActionError(""); }} className={`${vulfMono.className} rounded-xl border border-red-200 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50`}>Cancel booking</button>
                {actionError && !confirmCancelId && <p className={`${vulfMono.className} col-span-2 text-xs text-red-500`}>{actionError}</p>}
              </div>
            )}

            {editable && isConfirmingCancel && (
              <div className="pt-3 border-t border-black/5 space-y-3">
                <p className={`${vulfMono.className} text-xs text-neutral-600`}>
                  Cancel your reservation for <strong>{formatDateShort(b.date)}</strong> at <strong>{b.time_slot}</strong>? This cannot be undone.
                </p>
                {actionError && <p className={`${vulfMono.className} text-xs text-red-500`}>{actionError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setConfirmCancelId(null)} disabled={cancelLoading} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-2.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50`}>Keep it</button>
                  <button onClick={() => handleCancel(b)} disabled={cancelLoading} className={`${vulfMono.className} flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60`}>
                    {cancelLoading ? "Cancelling…" : "Yes, cancel"}
                  </button>
                </div>
              </div>
            )}

            {!editable && (
              <p className={`${vulfMono.className} text-xs text-neutral-400 pt-3 border-t border-black/5`}>
                This session has already started, so it can no longer be changed online.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Edit one booking ──────────────────────────────────────────────────────────

function EditBooking({ booking, proof, onUpdated, onStartPayment, onDone, onBack }: {
  booking: ManagedBooking;
  proof: Proof;
  onUpdated: (b: ManagedBooking) => void;
  onStartPayment: (b: ManagedBooking, clientSecret: string, amount: number) => void;
  onDone: (message: string) => void;
  onBack: () => void;
}) {
  // Starts on what they have now, so every other date and time reads as an
  // alternative to it rather than a blank form to fill in again.
  const [calMonth, setCalMonth] = useState(() => calMonthForDate(booking.date));
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [newDate, setNewDate] = useState(booking.date);
  const [newSlot, setNewSlot] = useState(booking.time_slot);
  const [newPartySize, setNewPartySize] = useState(booking.party_size);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [payChoice, setPayChoice] = useState<PayChoice>(booking.payment_method === "gift_card" ? "gift_card" : "studio");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const monthStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
    fetch(`/api/bookings/availability?month=${monthStr}&exclude_id=${booking.id}&location=${booking.location}`)
      .then((r) => (r.ok ? r.json() : { fullDates: [], closedDates: [] }))
      .then((data) => {
        setFullDates(new Set(data.fullDates ?? []));
        setClosedDates(new Set(data.closedDates ?? []));
      })
      .catch(() => {});
  }, [calMonth, booking.id, booking.location]);

  useEffect(() => {
    if (!newDate) return;
    setSlotsLoading(true);
    setSlots([]);
    fetch(`/api/bookings/availability?date=${newDate}&exclude_id=${booking.id}&location=${booking.location}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => { setSlots(data.slots ?? []); setSlotsLoading(false); })
      .catch(() => setSlotsLoading(false));
  }, [newDate, booking.id, booking.location]);

  function handleDateClick(d: string) {
    if (d === newDate) return;
    setNewDate(d);
    // Back on their original day, their original time is the natural pick.
    setNewSlot(d === booking.date ? booking.time_slot : "");
  }

  const unpaid = isUnpaidReservation(booking);
  const cardPaid = booking.payment_method === "stripe" && booking.amount_paid > 0;
  const detailsChanged = newDate !== booking.date || newSlot !== booking.time_slot || newPartySize !== booking.party_size;
  const total = PRICE_PER_PERSON * newPartySize;
  // On a card-paid booking the party size moves money: more people owe the
  // difference, fewer get it back.
  const balanceCents = cardPaid ? amountDueCents({ party_size: newPartySize, amount_paid: booking.amount_paid }) : 0;
  const refundCents = cardPaid ? refundDueCents(booking, newPartySize) : 0;
  const payNow = (unpaid && payChoice === "card") || balanceCents > 0;
  const payLabel = cardPaid ? dollars(balanceCents) : `$${total}`;
  const methodChanged = unpaid && !payNow && (payChoice === "gift_card") !== (booking.payment_method === "gift_card");
  const nothingToDo = !detailsChanged && !methodChanged && !payNow;

  async function handleSubmit() {
    if (!newDate || !newSlot || nothingToDo) return;
    setSaving(true);
    setError("");
    let current = booking;
    let saved = false;
    let refunded = 0;
    try {
      if (detailsChanged || methodChanged) {
        const res = await fetch(`/api/bookings/manage/${booking.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            ...proof,
            date: newDate,
            time_slot: newSlot,
            party_size: newPartySize,
            // Left out when paying by card: the payment itself marks the
            // booking as paid, and an abandoned card form should change nothing.
            ...(unpaid && !payNow ? { payment_method: payChoice === "gift_card" ? "gift_card" : null } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to update."); return; }
        current = {
          ...booking,
          date: newDate,
          time_slot: newSlot,
          party_size: newPartySize,
          payment_method: "payment_method" in data ? data.payment_method : booking.payment_method,
          amount_paid: data.amount_paid ?? booking.amount_paid,
        };
        refunded = data.refunded_cents ?? 0;
        saved = true;
        onUpdated(current);
      }

      if (payNow) {
        const res = await fetch(`/api/bookings/manage/${booking.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proof),
        });
        const data = await res.json();
        if (!res.ok) {
          const reason = data.error || "Please try again.";
          setError(saved ? `Your changes are saved, but the payment couldn't be started. ${reason}` : reason);
          return;
        }
        onStartPayment(current, data.clientSecret, data.amount);
        return;
      }

      onDone(
        refunded > 0
          ? `Booking updated. ${dollars(refunded)} is on its way back to your card and usually shows up within 5 to 10 business days.`
          : "Booking updated. A confirmation email is on its way."
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = saving
    ? "Saving…"
    : payNow
    ? detailsChanged ? `SAVE & PAY ${payLabel}` : `PAY ${payLabel}`
    : nothingToDo ? "NO CHANGES YET" : "SAVE CHANGES";
  const canSubmit = !saving && !nothingToDo && !!newDate && !!newSlot;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Edit booking</p>
          <p className={`${vulfMono.className} text-sm text-neutral-600 mt-0.5`}>
            Currently: {formatDateShort(booking.date)} at {booking.time_slot} · {partyLabel(booking.party_size)}
          </p>
        </div>
        <button onClick={onBack} className={`${vulfMono.className} shrink-0 text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>Back</button>
      </div>

      {/* Date */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-5`}>Date</p>
        <Calendar calMonth={calMonth} setCalMonth={setCalMonth} fullDates={fullDates} closedDates={closedDates} selectedDate={newDate} onDateClick={handleDateClick} />
      </div>

      {/* Time */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-1`}>Time</p>
        <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>{formatDateLong(newDate)}</p>
        {slotsLoading && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>Loading…</p>}
        {!slotsLoading && slots.length === 0 && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>No available times for this date.</p>}
        {!slotsLoading && slots.length > 0 && (
          <SlotGrid slots={slots} selectedSlot={newSlot} onSelect={setNewSlot} currentSlot={newDate === booking.date ? booking.time_slot : undefined} />
        )}
      </div>

      {/* Party size */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Party size</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setNewPartySize(Math.max(1, newPartySize - 1))} className="w-10 h-10 rounded-xl border border-black/20 flex items-center justify-center text-lg hover:bg-neutral-50">−</button>
          <span className={`${vulfMono.className} text-xl font-bold w-8 text-center`}>{newPartySize}</span>
          <button type="button" onClick={() => setNewPartySize(Math.min(MAX_PARTY_SIZE, newPartySize + 1))} className="w-10 h-10 rounded-xl border border-black/20 flex items-center justify-center text-lg hover:bg-neutral-50">+</button>
          <span className={`${vulfMono.className} text-xs text-neutral-400`}>{newPartySize === 1 ? "person" : "people"} · ${total} total</span>
        </div>
        <p className={`${vulfMono.className} text-xs text-neutral-300`}>Max {MAX_PARTY_SIZE} per booking</p>
        {balanceCents > 0 && (
          <p className={`${vulfMono.className} text-xs text-amber-700`}>
            You&apos;ve paid {dollars(booking.amount_paid)}. That leaves {dollars(balanceCents)} for the extra guests, which you&apos;ll pay by card on the next step.
          </p>
        )}
        {refundCents > 0 && (
          <p className={`${vulfMono.className} text-xs text-amber-700`}>
            You&apos;ve paid {dollars(booking.amount_paid)}. Saving this refunds {dollars(refundCents)} to your card.
          </p>
        )}
      </div>

      {/* Payment */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-3">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Payment</p>
        {unpaid ? (
          <>
            <PayOption
              selected={payChoice === "studio"}
              onSelect={() => setPayChoice("studio")}
              title="Pay in studio"
              detail={`$${PRICE_PER_PERSON} per person when you arrive`}
            />
            <PayOption
              selected={payChoice === "gift_card"}
              onSelect={() => setPayChoice("gift_card")}
              title="I'm paying with a gift card"
              detail="Bring your gift card and the studio fee comes off it in studio"
            />
            <PayOption
              selected={payChoice === "card"}
              onSelect={() => setPayChoice("card")}
              title="Pay now by card"
              detail={`$${total} total, and nothing is due when you arrive`}
            />
          </>
        ) : (
          <p className={`${vulfMono.className} text-sm text-neutral-600 flex items-center gap-2`}>
            {booking.amount_paid > 0 ? (
              <span className={balanceCents > 0 ? "text-amber-700" : "text-[#519A70]"}>
                Paid {dollars(booking.amount_paid)} by card{balanceCents > 0 ? ` · ${dollars(balanceCents)} to pay` : ""}
              </span>
            ) : (
              <PaymentBadge method={booking.payment_method} />
            )}
          </p>
        )}
      </div>

      {detailsChanged && newSlot && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-3`}>Your changes</p>
          <div className={`${vulfMono.className} text-sm space-y-3`}>
            <ChangeRow label="Date" before={formatDateShort(booking.date)} after={formatDateShort(newDate)} changed={newDate !== booking.date} />
            <ChangeRow label="Time" before={booking.time_slot} after={newSlot} changed={newSlot !== booking.time_slot} />
            <ChangeRow label="Party" before={partyLabel(booking.party_size)} after={partyLabel(newPartySize)} changed={newPartySize !== booking.party_size} />
          </div>
        </div>
      )}

      {!newSlot && <p className={`${vulfMono.className} text-xs text-neutral-500 text-center`}>Pick a time for {formatDateShort(newDate)} to continue.</p>}
      {error && <p className={`${vulfMono.className} text-xs text-red-500 text-center`}>{error}</p>}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={saving} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-50`}>Back</button>
        <button onClick={handleSubmit} disabled={!canSubmit}
          className={`${vulfMono.className} flex-[2] rounded-xl py-3 text-sm tracking-[0.15em] font-semibold text-white transition-opacity ${canSubmit ? "bg-[#519A70] hover:opacity-90" : "bg-neutral-300 cursor-not-allowed"}`}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function PayOption({ selected, onSelect, title, detail }: {
  selected: boolean; onSelect: () => void; title: string; detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
        selected ? "border-[#884A20] bg-[#884A20]/5" : "border-black/10 hover:border-[#884A20]/40"
      }`}
    >
      <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${selected ? "border-[#884A20]" : "border-black/30"}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-[#884A20]" />}
      </span>
      <span>
        <span className={`${vulfMono.className} block text-sm text-neutral-800`}>{title}</span>
        <span className={`${vulfMono.className} block text-xs text-neutral-400 mt-0.5`}>{detail}</span>
      </span>
    </button>
  );
}

function ChangeRow({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-neutral-400 w-12 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">
        {changed ? (
          <><span className="text-neutral-400 line-through">{before}</span><span className="text-[10px] text-neutral-300">→</span><span className="text-neutral-800 font-medium">{after}</span></>
        ) : (
          <span className="text-neutral-600">{before}</span>
        )}
      </div>
    </div>
  );
}
