"use client";

// components/booking/shared.tsx
//
// The pieces the booking flow (app/book) and the manage flow (ManageBookings)
// both use: the calendar, the slot grid, the Stripe payment form, and the
// small date helpers around them.
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { PaymentElement, ExpressCheckoutElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { vulfMono } from "@/app/fonts";

export const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export const stripeAppearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#884A20",
    colorBackground: "#ffffff",
    colorText: "#3A3A3A",
    colorDanger: "#ef4444",
    borderRadius: "12px",
    fontSizeBase: "14px",
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlotInfo = { time: string; available: number; isFull: boolean };

export type ManagedBooking = {
  id: string;
  name?: string;
  email?: string;
  date: string;
  time_slot: string;
  party_size: number;
  payment_method: string | null;
  amount_paid: number;
  location: "orem" | "slc";
  // Signed token from an emailed link. When present it is sent instead of the
  // booking email as proof that this person may manage the booking.
  token?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function isPast(dateStr: string): boolean {
  return dateStr < toDateStr(new Date());
}

export function calMonthForDate(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function partyLabel(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

export function PaymentBadge({ method }: { method: string | null }) {
  if (!method || method === "stripe") return null;
  if (method === "gift_card")
    return <span className="rounded-full bg-yellow-100 text-yellow-700 text-[11px] px-2 py-0.5">Gift card</span>;
  if (method === "complimentary")
    return <span className="rounded-full bg-neutral-100 text-neutral-600 text-[11px] px-2 py-0.5">Complimentary</span>;
  return <span className="rounded-full bg-purple-100 text-purple-700 text-[11px] px-2 py-0.5">Get Out Pass</span>;
}

export const inputCls =
  "w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#884A20] transition-colors";

// ── Calendar ──────────────────────────────────────────────────────────────────

export function Calendar({
  calMonth, setCalMonth, fullDates, closedDates, selectedDate, onDateClick,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  fullDates: Set<string>;
  closedDates: Set<string>;
  selectedDate: string;
  onDateClick: (d: string) => void;
}) {
  const today = toDateStr(new Date());
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const canGoPrev = calMonth > new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const cells: Array<string | null> = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button type="button" onClick={() => setCalMonth(new Date(year, month - 1, 1))} disabled={!canGoPrev}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-neutral-100 disabled:opacity-20 disabled:cursor-not-allowed text-xl">‹</button>
        <span className={`${vulfMono.className} text-base font-medium`}>{monthLabel}</span>
        <button type="button" onClick={() => setCalMonth(new Date(year, month + 1, 1))}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-neutral-100 text-xl">›</button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className={`${vulfMono.className} text-center text-xs text-neutral-400 py-1`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`e-${i}`} />;
          const disabled = closedDates.has(dateStr) || isPast(dateStr) || fullDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          return (
            <button type="button" key={dateStr} onClick={() => !disabled && onDateClick(dateStr)} disabled={disabled}
              title={closedDates.has(dateStr) ? "Closed" : fullDates.has(dateStr) ? "Fully booked" : undefined}
              className={[
                "aspect-square w-full rounded-xl text-sm font-medium transition-colors flex items-center justify-center",
                isSelected ? "bg-[#884A20] text-white" : "",
                isToday && !isSelected ? "ring-2 ring-[#884A20] ring-offset-1 text-[#884A20]" : "",
                !disabled && !isSelected ? "hover:bg-[#884A20]/10 cursor-pointer text-neutral-800" : "",
                disabled && !isSelected ? "text-neutral-300 cursor-not-allowed line-through" : "",
              ].filter(Boolean).join(" ")}>
              {parseInt(dateStr.split("-")[2], 10)}
            </button>
          );
        })}
      </div>
      <p className={`${vulfMono.className} text-[10px] text-neutral-300 mt-3`}>
        Strikethrough = closed or fully booked
      </p>
    </div>
  );
}

// ── Slot grid ─────────────────────────────────────────────────────────────────

export function SlotGrid({ slots, selectedSlot, onSelect, currentSlot }: {
  slots: SlotInfo[];
  selectedSlot: string;
  onSelect: (s: string) => void;
  // When editing: the time the booking is at right now, labelled so the other
  // slots read as alternatives to it.
  currentSlot?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot.time;
        const isCurrent = currentSlot === slot.time;
        const spotsLabel = isCurrent ? "Your time" : slot.isFull ? "Full" : slot.available <= 5 ? `${slot.available} left` : "Open";
        const spotsColor = isCurrent ? "text-[#884A20]" : slot.isFull ? "text-red-400" : slot.available <= 5 ? "text-amber-500" : "text-[#519A70]";
        return (
          <button type="button" key={slot.time} disabled={slot.isFull} onClick={() => onSelect(slot.time)}
            className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 transition-all ${
              isSelected ? "border-[#884A20] bg-[#884A20]/5"
              : slot.isFull ? "border-black/5 bg-neutral-50 cursor-not-allowed opacity-40"
              : "border-black/10 hover:border-[#884A20]/40 cursor-pointer"
            }`}>
            <span className={`${vulfMono.className} text-sm font-medium`}>{slot.time}</span>
            <span className={`${vulfMono.className} text-[11px] mt-0.5 ${spotsColor}`}>{spotsLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Payment form (must be inside <Elements>) ──────────────────────────────────

export function PaymentForm({
  total, email, onSuccess,
}: {
  total: number;
  // Receipt address. Omitted when the PaymentIntent already carries one.
  email?: string;
  onSuccess: (bookingId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState("");

  async function confirmPayment() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setCardError("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation`,
        ...(email ? { receipt_email: email } : {}),
      },
    });

    if (error) {
      setCardError(error.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    // Payment succeeded — create the booking record
    const res = await fetch("/api/bookings/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      setCardError(data.error ?? "Payment succeeded but booking creation failed. Please contact us.");
      setSubmitting(false);
      return;
    }

    onSuccess(data.booking_id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await confirmPayment();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ExpressCheckoutElement
        options={{ paymentMethods: { link: "auto", applePay: "auto", googlePay: "auto" } }}
        onConfirm={confirmPayment}
      />
      <PaymentElement options={{ paymentMethodOrder: ["card", "link"], wallets: { link: "auto" } }} />
      {cardError && <p className={`${vulfMono.className} text-xs text-red-500`}>{cardError}</p>}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity`}
      >
        {submitting ? "Processing…" : `Complete Payment: $${total}`}
      </button>
    </form>
  );
}
