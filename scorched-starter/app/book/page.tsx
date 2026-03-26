"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { MAX_PARTY_SIZE } from "@/lib/booking-utils";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const stripeAppearance = {
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

type Tab = "book" | "manage";
type BookStep = 1 | 2 | 3;
type ManageScreen = "lookup" | "list" | "editing";
type EditStep = 1 | 2 | 3;
type PaymentMethod = "gift_card" | "get_out_pass" | null;

type SlotInfo = { time: string; available: number; isFull: boolean };

type SimpleBooking = {
  id: string;
  name: string;
  date: string;
  time_slot: string;
  party_size: number;
  payment_method: string | null;
  status: string;
  amount_paid: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + "T12:00:00").getDay() === 0;
}

function isPast(dateStr: string): boolean {
  return dateStr < toDateStr(new Date());
}

function isBookingEditable(date: string, timeSlot: string): boolean {
  const today = toDateStr(new Date());
  if (date > today) return true;
  if (date < today) return false;
  const match = timeSlot.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return false;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  const slotTime = new Date();
  slotTime.setHours(hours, minutes, 0, 0);
  return new Date() < slotTime;
}

function calMonthForDate(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function PaymentBadge({ method }: { method: string | null }) {
  if (!method || method === "stripe") return null;
  if (method === "gift_card")
    return <span className="rounded-full bg-yellow-100 text-yellow-700 text-[11px] px-2 py-0.5">Gift card</span>;
  return <span className="rounded-full bg-purple-100 text-purple-700 text-[11px] px-2 py-0.5">Get Out Pass</span>;
}

const inputCls =
  "w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#884A20] transition-colors";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [tab, setTab] = useState<Tab>("book");

  // Read ?tab=manage from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "manage") setTab("manage");
  }, []);

  // ── Book tab state ──────────────────────────────────────────────────────────
  const [bookStep, setBookStep] = useState<BookStep>(1);
  const [bookCalMonth, setBookCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [bookFullDates, setBookFullDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState("");
  const [bookSlots, setBookSlots] = useState<SlotInfo[]>([]);
  const [bookSlotsLoading, setBookSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [formError, setFormError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [payClientSecret, setPayClientSecret] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveError, setReserveError] = useState("");

  // ── Manage tab state ────────────────────────────────────────────────────────
  const [manageScreen, setManageScreen] = useState<ManageScreen>("lookup");
  const [manageEmail, setManageEmail] = useState("");
  const [bookings, setBookings] = useState<SimpleBooking[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [editingBooking, setEditingBooking] = useState<SimpleBooking | null>(null);
  const [editStep, setEditStep] = useState<EditStep>(1);
  const [editCalMonth, setEditCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editFullDates, setEditFullDates] = useState<Set<string>>(new Set());
  const [newDate, setNewDate] = useState("");
  const [editSlots, setEditSlots] = useState<SlotInfo[]>([]);
  const [editSlotsLoading, setEditSlotsLoading] = useState(false);
  const [newSlot, setNewSlot] = useState("");
  const [newPartySize, setNewPartySize] = useState(1);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Book tab effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "book") return;
    const monthStr = `${bookCalMonth.getFullYear()}-${String(bookCalMonth.getMonth() + 1).padStart(2, "0")}`;
    fetch(`/api/bookings/availability?month=${monthStr}`)
      .then((r) => (r.ok ? r.json() : { fullDates: [] }))
      .then((data) => setBookFullDates(new Set(data.fullDates ?? [])))
      .catch(() => {});
  }, [bookCalMonth, tab]);

  useEffect(() => {
    if (!selectedDate || tab !== "book") return;
    setBookSlotsLoading(true);
    setBookSlots([]);
    fetch(`/api/bookings/availability?date=${selectedDate}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => { setBookSlots(data.slots ?? []); setBookSlotsLoading(false); })
      .catch(() => setBookSlotsLoading(false));
  }, [selectedDate, tab]);

  // ── Manage tab effects ──────────────────────────────────────────────────────

  useEffect(() => {
    if (manageScreen !== "editing") return;
    const monthStr = `${editCalMonth.getFullYear()}-${String(editCalMonth.getMonth() + 1).padStart(2, "0")}`;
    const excludeId = editingBooking?.id ?? "";
    fetch(`/api/bookings/availability?month=${monthStr}&exclude_id=${excludeId}`)
      .then((r) => (r.ok ? r.json() : { fullDates: [] }))
      .then((data) => setEditFullDates(new Set(data.fullDates ?? [])))
      .catch(() => {});
  }, [editCalMonth, manageScreen, editingBooking?.id]);

  useEffect(() => {
    if (!newDate || manageScreen !== "editing") return;
    setEditSlotsLoading(true);
    setEditSlots([]);
    const excludeId = editingBooking?.id ?? "";
    fetch(`/api/bookings/availability?date=${newDate}&exclude_id=${excludeId}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => { setEditSlots(data.slots ?? []); setEditSlotsLoading(false); })
      .catch(() => setEditSlotsLoading(false));
  }, [newDate, manageScreen, editingBooking?.id]);

  // ── Book tab handlers ───────────────────────────────────────────────────────

  function handleDateClick(dateStr: string) {
    if (isPast(dateStr) || isSunday(dateStr) || bookFullDates.has(dateStr)) return;
    if (dateStr === selectedDate) return;
    setSelectedDate(dateStr);
    setSelectedSlot("");
  }

  function handleStep1Continue() {
    if (!selectedDate || !selectedSlot) return;
    setBookStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStep2Continue() {
    if (!name.trim()) { setFormError("Name is required."); return; }
    if (!email.trim()) { setFormError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError("Please enter a valid email address."); return; }
    setFormError("");
    setBookStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleInitiatePayment() {
    setPayLoading(true);
    setPayError("");
    try {
      const res = await fetch("/api/bookings/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, time_slot: selectedSlot, party_size: partySize, name, email, phone }),
      });
      const data = await res.json();
      if (!res.ok) { setPayError(data.error || "Something went wrong."); setPayLoading(false); return; }
      setPayClientSecret(data.clientSecret);
    } catch {
      setPayError("Something went wrong. Please try again.");
    }
    setPayLoading(false);
  }

  function handlePaySuccess(bookingId: string) {
    window.location.href = `/book/confirmation?booking_id=${bookingId}`;
  }

  async function handleReserve() {
    setReserveLoading(true);
    setReserveError("");
    try {
      const res = await fetch("/api/bookings/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, time_slot: selectedSlot, party_size: partySize, name, email, phone, payment_method: paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) { setReserveError(data.error || "Something went wrong."); setReserveLoading(false); return; }
      window.location.href = `/book/confirmation?booking_id=${data.booking_id}`;
    } catch {
      setReserveError("Something went wrong. Please try again.");
      setReserveLoading(false);
    }
  }

  // ── Manage tab handlers ─────────────────────────────────────────────────────

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!manageEmail.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const res = await fetch(`/api/bookings/manage?email=${encodeURIComponent(manageEmail.trim())}`);
      const data = await res.json();
      if (!res.ok) { setLookupError(data.error || "Something went wrong."); setLookupLoading(false); return; }
      setBookings(data.bookings ?? []);
      setManageScreen("list");
    } catch {
      setLookupError("Something went wrong. Please try again.");
    }
    setLookupLoading(false);
  }

  async function handleCancel(id: string) {
    setCancelLoading(true);
    setCancelError("");
    try {
      const res = await fetch(`/api/bookings/manage/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", email: manageEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelError(data.error || "Failed to cancel."); setCancelLoading(false); return; }
      setBookings((prev) => prev.filter((b) => b.id !== id));
      setConfirmCancelId(null);
    } catch {
      setCancelError("Something went wrong. Please try again.");
    }
    setCancelLoading(false);
  }

  function startEdit(booking: SimpleBooking) {
    setEditingBooking(booking);
    setNewDate(booking.date);
    setNewSlot(booking.time_slot);
    setNewPartySize(booking.party_size);
    setEditCalMonth(calMonthForDate(booking.date));
    setEditStep(1);
    setSaveError("");
    setManageScreen("editing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!editingBooking || !newDate || !newSlot) return;
    setSaveLoading(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/bookings/manage/${editingBooking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", email: manageEmail, date: newDate, time_slot: newSlot, party_size: newPartySize }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || "Failed to update."); setSaveLoading(false); return; }
      setBookings((prev) =>
        prev.map((b) => b.id === editingBooking.id ? { ...b, date: newDate, time_slot: newSlot, party_size: newPartySize } : b)
      );
      setManageScreen("list");
    } catch {
      setSaveError("Something went wrong. Please try again.");
    }
    setSaveLoading(false);
  }

  const bookIsLoading = payLoading || reserveLoading;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 pb-8">
        <Container>
          <p className="eyebrow text-brand text-center">Scorched Studio</p>
          <h1 className="h2 font-bold text-center">
            {tab === "book" ? "Book a Session" : "Manage Booking"}
          </h1>
          <p className={`${vulfMono.className} text-center text-neutral-500 mt-2 text-sm`}>
            {tab === "book"
              ? "$15 per person · 90-minute sessions · Open Mon–Sat"
              : "Cancel or reschedule before your session starts"}
          </p>

          {/* Tab switcher */}
          <div className={`${vulfMono.className} flex justify-center mt-6`}>
            <div className="flex rounded-xl border border-black/10 bg-white p-1 gap-1 shadow-sm">
              {(["book", "manage"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2 rounded-lg text-xs tracking-[0.12em] font-medium transition-colors ${
                    tab === t
                      ? "bg-[#884A20] text-white"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {t === "book" ? "BOOK" : "MANAGE"}
                </button>
              ))}
            </div>
          </div>

          {/* Step indicator — book tab only */}
          {tab === "book" && (
            <div className="flex flex-col items-center mt-6">
              <div className="flex items-center gap-2">
                {(["Date & Time", "Your Details", "Review & Pay"] as const).map((label, i) => {
                  const s = (i + 1) as BookStep;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          bookStep === s ? "bg-[#884A20] text-white" : bookStep > s ? "bg-[#519A70] text-white" : "bg-neutral-200 text-neutral-400"
                        }`}>
                          {bookStep > s ? "✓" : s}
                        </div>
                        <span className={`${vulfMono.className} hidden sm:block text-[10px] whitespace-nowrap ${bookStep === s ? "text-[#884A20] font-medium" : "text-neutral-400"}`}>
                          {label}
                        </span>
                      </div>
                      {s < 3 && <div className={`w-6 sm:w-12 h-0.5 mb-4 ${bookStep > s ? "bg-[#519A70]" : "bg-neutral-200"}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Container>
      </section>

      <Container className="max-w-xl">
        {/* ── Book tab ── */}
        {tab === "book" && (
          <>
            {bookStep === 1 && (
              <BookStep1
                calMonth={bookCalMonth}
                setCalMonth={setBookCalMonth}
                fullDates={bookFullDates}
                selectedDate={selectedDate}
                onDateClick={handleDateClick}
                slots={bookSlots}
                slotsLoading={bookSlotsLoading}
                selectedSlot={selectedSlot}
                setSelectedSlot={setSelectedSlot}
                onContinue={handleStep1Continue}
              />
            )}
            {bookStep === 2 && (
              <BookStep2
                name={name} setName={setName}
                email={email} setEmail={setEmail}
                phone={phone} setPhone={setPhone}
                partySize={partySize} setPartySize={setPartySize}
                error={formError}
                onBack={() => setBookStep(1)}
                onContinue={handleStep2Continue}
              />
            )}
            {bookStep === 3 && (
              <BookStep3
                date={selectedDate}
                slot={selectedSlot}
                partySize={partySize}
                name={name}
                email={email}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                payLoading={payLoading}
                payError={payError}
                reserveLoading={reserveLoading}
                reserveError={reserveError}
                isLoading={bookIsLoading}
                payClientSecret={payClientSecret}
                onBack={() => { setBookStep(2); setPayClientSecret(""); setPayError(""); }}
                onInitiatePayment={handleInitiatePayment}
                onPaySuccess={handlePaySuccess}
                onReserve={handleReserve}
              />
            )}
          </>
        )}

        {/* ── Manage tab ── */}
        {tab === "manage" && (
          <>
            {manageScreen === "lookup" && (
              <LookupForm
                email={manageEmail}
                setEmail={setManageEmail}
                loading={lookupLoading}
                error={lookupError}
                onSubmit={handleLookup}
              />
            )}
            {manageScreen === "list" && (
              <BookingList
                email={manageEmail}
                bookings={bookings}
                confirmCancelId={confirmCancelId}
                setConfirmCancelId={setConfirmCancelId}
                cancelLoading={cancelLoading}
                cancelError={cancelError}
                onCancel={handleCancel}
                onEdit={startEdit}
                onBack={() => { setManageScreen("lookup"); setCancelError(""); }}
                onBookNew={() => setTab("book")}
              />
            )}
            {manageScreen === "editing" && editingBooking && (
              <EditFlow
                booking={editingBooking}
                step={editStep}
                setStep={setEditStep}
                calMonth={editCalMonth}
                setCalMonth={setEditCalMonth}
                fullDates={editFullDates}
                newDate={newDate}
                setNewDate={(d) => { setNewDate(d); setNewSlot(""); }}
                slots={editSlots}
                slotsLoading={editSlotsLoading}
                newSlot={newSlot}
                setNewSlot={setNewSlot}
                newPartySize={newPartySize}
                setNewPartySize={setNewPartySize}
                saveLoading={saveLoading}
                saveError={saveError}
                onBack={() => setManageScreen("list")}
                onSave={handleSave}
              />
            )}
          </>
        )}
      </Container>
    </main>
  );
}

// ── Calendar (shared) ─────────────────────────────────────────────────────────

function Calendar({
  calMonth, setCalMonth, fullDates, selectedDate, onDateClick,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  fullDates: Set<string>;
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
        <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} disabled={!canGoPrev}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-neutral-100 disabled:opacity-20 disabled:cursor-not-allowed text-xl">‹</button>
        <span className={`${vulfMono.className} text-base font-medium`}>{monthLabel}</span>
        <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}
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
          const disabled = isSunday(dateStr) || isPast(dateStr) || fullDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          return (
            <button key={dateStr} onClick={() => !disabled && onDateClick(dateStr)} disabled={disabled}
              title={isSunday(dateStr) ? "Closed Sunday" : fullDates.has(dateStr) ? "Fully booked" : undefined}
              className={[
                "aspect-square w-full rounded-xl text-sm font-medium transition-colors flex items-center justify-center",
                isSelected ? "bg-[#884A20] text-white" : "",
                isToday && !isSelected ? "ring-2 ring-[#884A20] ring-offset-1 text-[#884A20]" : "",
                !disabled && !isSelected ? "hover:bg-[#884A20]/10 cursor-pointer text-neutral-800" : "",
                disabled ? "text-neutral-300 cursor-not-allowed line-through" : "",
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

// ── Slot grid (shared) ────────────────────────────────────────────────────────

function SlotGrid({ slots, selectedSlot, onSelect }: {
  slots: SlotInfo[];
  selectedSlot: string;
  onSelect: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot.time;
        const spotsLabel = slot.isFull ? "Full" : slot.available <= 5 ? `${slot.available} left` : "Open";
        const spotsColor = slot.isFull ? "text-red-400" : slot.available <= 5 ? "text-amber-500" : "text-[#519A70]";
        return (
          <button key={slot.time} disabled={slot.isFull} onClick={() => onSelect(slot.time)}
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

// ── Book Step 1 ───────────────────────────────────────────────────────────────

function BookStep1({ calMonth, setCalMonth, fullDates, selectedDate, onDateClick, slots, slotsLoading, selectedSlot, setSelectedSlot, onContinue }: {
  calMonth: Date; setCalMonth: (d: Date) => void; fullDates: Set<string>;
  selectedDate: string; onDateClick: (d: string) => void;
  slots: SlotInfo[]; slotsLoading: boolean;
  selectedSlot: string; setSelectedSlot: (s: string) => void; onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-5`}>Select a date</p>
        <Calendar calMonth={calMonth} setCalMonth={setCalMonth} fullDates={fullDates} selectedDate={selectedDate} onDateClick={onDateClick} />
      </div>

      {selectedDate && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-1`}>Select a time</p>
          <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>{formatDateLong(selectedDate)}</p>
          {slotsLoading && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>Loading…</p>}
          {!slotsLoading && slots.length === 0 && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>No available times for this date.</p>}
          {!slotsLoading && slots.length > 0 && <SlotGrid slots={slots} selectedSlot={selectedSlot} onSelect={setSelectedSlot} />}
        </div>
      )}

      <button onClick={onContinue} disabled={!selectedDate || !selectedSlot}
        className={`${vulfMono.className} w-full rounded-xl py-3 text-sm tracking-[0.15em] font-semibold text-white transition-opacity ${selectedDate && selectedSlot ? "bg-[#884A20] hover:opacity-90" : "bg-neutral-300 cursor-not-allowed"}`}>
        CONTINUE
      </button>
    </div>
  );
}

// ── Book Step 2 ───────────────────────────────────────────────────────────────

function BookStep2({ name, setName, email, setEmail, phone, setPhone, partySize, setPartySize, error, onBack, onContinue }: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  partySize: number; setPartySize: (v: number) => void;
  error: string; onBack: () => void; onContinue: () => void;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-5">
      <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Your details</p>
      <div className="space-y-4">
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Full name <span className="text-red-400">*</span></label>
          <input type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Jane Smith" />
        </div>
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Email <span className="text-red-400">*</span></label>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Phone <span className="text-neutral-300">(optional)</span></label>
          <input type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(801) 555-0100" />
        </div>
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Party size <span className="text-red-400">*</span></label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPartySize(Math.max(1, partySize - 1))} className="w-10 h-10 rounded-xl border border-black/20 flex items-center justify-center text-lg hover:bg-neutral-50">−</button>
            <span className={`${vulfMono.className} text-xl font-bold w-8 text-center`}>{partySize}</span>
            <button type="button" onClick={() => setPartySize(Math.min(MAX_PARTY_SIZE, partySize + 1))} className="w-10 h-10 rounded-xl border border-black/20 flex items-center justify-center text-lg hover:bg-neutral-50">+</button>
            <span className={`${vulfMono.className} text-xs text-neutral-400`}>{partySize === 1 ? "person" : "people"} · ${15 * partySize} total</span>
          </div>
          <p className={`${vulfMono.className} text-xs text-neutral-300 mt-1.5`}>Max {MAX_PARTY_SIZE} per booking</p>
        </div>
      </div>
      {error && <p className={`${vulfMono.className} text-xs text-red-500`}>{error}</p>}
      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50`}>Back</button>
        <button onClick={onContinue} className={`${vulfMono.className} flex-[2] rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90`}>CONTINUE</button>
      </div>
    </div>
  );
}

// ── Book Step 3 ───────────────────────────────────────────────────────────────

function BookStep3({
  date, slot, partySize, name, email,
  paymentMethod, setPaymentMethod,
  payLoading, payError, reserveLoading, reserveError, isLoading,
  payClientSecret, onBack, onInitiatePayment, onPaySuccess, onReserve,
}: {
  date: string; slot: string; partySize: number; name: string; email: string;
  paymentMethod: PaymentMethod; setPaymentMethod: (v: PaymentMethod) => void;
  payLoading: boolean; payError: string; reserveLoading: boolean; reserveError: string; isLoading: boolean;
  payClientSecret: string;
  onBack: () => void; onInitiatePayment: () => void; onPaySuccess: (id: string) => void; onReserve: () => void;
}) {
  const total = 15 * partySize;
  const payBlocked = paymentMethod === "gift_card" || paymentMethod === "get_out_pass";

  function toggleMethod(method: "gift_card" | "get_out_pass") {
    setPaymentMethod(paymentMethod === method ? null : method);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-4`}>Booking summary</p>
        <div className={`${vulfMono.className} space-y-3 text-sm`}>
          <SummaryRow label="Date" value={formatDateLong(date)} />
          <SummaryRow label="Time" value={slot} />
          <SummaryRow label="Party" value={`${partySize} ${partySize === 1 ? "person" : "people"}`} />
          <SummaryRow label="Name" value={name} />
          <SummaryRow label="Email" value={email} />
          <div className="pt-3 border-t border-black/5 flex items-center justify-between font-bold">
            <span>Total</span><span className="text-lg">${total}</span>
          </div>
        </div>
      </div>

      {/* Payment options */}
      {!payClientSecret && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-3">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-1`}>Payment options</p>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" className="mt-0.5 w-4 h-4 rounded accent-[#884A20] cursor-pointer" checked={paymentMethod === "gift_card"} onChange={() => toggleMethod("gift_card")} disabled={isLoading} />
            <div>
              <span className={`${vulfMono.className} text-sm text-neutral-800 group-hover:text-[#884A20] transition-colors`}>I&apos;m paying with a gift card</span>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>Reserve free — pay the $15/person studio fee in-studio</p>
            </div>
          </label>
          {paymentMethod === "gift_card" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className={`${vulfMono.className} text-xs text-amber-800`}><strong>Note:</strong> Please bring your gift card when you arrive. The $15 per-person studio fee will be collected in-studio.</p>
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" className="mt-0.5 w-4 h-4 rounded accent-[#884A20] cursor-pointer" checked={paymentMethod === "get_out_pass"} onChange={() => toggleMethod("get_out_pass")} disabled={isLoading} />
            <div>
              <span className={`${vulfMono.className} text-sm text-neutral-800 group-hover:text-[#884A20] transition-colors`}>I&apos;m using a Get Out Pass</span>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>Reserve free — bring your pass when you arrive</p>
            </div>
          </label>
        </div>
      )}

      {/* Inline payment form */}
      {!payBlocked && payClientSecret && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-4`}>Card details</p>
          <Elements stripe={stripePromise} options={{ clientSecret: payClientSecret, appearance: stripeAppearance }}>
            <PaymentForm
              total={total}
              email={email}
              onSuccess={onPaySuccess}
            />
          </Elements>
        </div>
      )}

      {(payError || reserveError) && (
        <p className={`${vulfMono.className} text-xs text-red-500 text-center`}>{payError || reserveError}</p>
      )}

      {/* Action buttons */}
      {!payClientSecret && (
        <div className="flex gap-3">
          <button onClick={onBack} disabled={isLoading} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-50`}>Back</button>
          <button onClick={onReserve} disabled={isLoading} className={`${vulfMono.className} flex-[2] rounded-xl py-3 text-sm tracking-[0.1em] font-semibold transition-opacity disabled:opacity-60 ${payBlocked ? "bg-[#519A70] text-white hover:opacity-90" : "border border-black/20 text-neutral-600 hover:bg-neutral-50"}`}>
            {reserveLoading ? "Reserving…" : "RESERVE FREE"}
          </button>
          {!payBlocked && (
            <button onClick={onInitiatePayment} disabled={isLoading} className={`${vulfMono.className} flex-[2] rounded-xl bg-[#519A70] py-3 text-sm tracking-[0.1em] font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity`}>
              {payLoading ? "Loading…" : `PAY $${total}`}
            </button>
          )}
        </div>
      )}

      {payClientSecret && (
        <button onClick={onBack} className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
          ← Back
        </button>
      )}
    </div>
  );
}

// ── Payment form (must be inside <Elements>) ──────────────────────────────────

function PaymentForm({
  total, email, onSuccess,
}: {
  total: number;
  email: string;
  onSuccess: (bookingId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setCardError("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation`,
        receipt_email: email,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {cardError && <p className={`${vulfMono.className} text-xs text-red-500`}>{cardError}</p>}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity`}
      >
        {submitting ? "Processing…" : `Complete Payment — $${total}`}
      </button>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-12 shrink-0">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}

// ── Manage: Lookup Form ───────────────────────────────────────────────────────

function LookupForm({ email, setEmail, loading, error, onSubmit }: {
  email: string; setEmail: (v: string) => void;
  loading: boolean; error: string; onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
      <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Find your booking</p>
      <div>
        <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>Email address used when booking</label>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoFocus required />
      </div>
      {error && <p className={`${vulfMono.className} text-xs text-red-500`}>{error}</p>}
      <button type="submit" disabled={loading} className={`${vulfMono.className} w-full rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60`}>
        {loading ? "Looking up…" : "FIND MY BOOKINGS"}
      </button>
    </form>
  );
}

// ── Manage: Booking List ──────────────────────────────────────────────────────

function BookingList({ email, bookings, confirmCancelId, setConfirmCancelId, cancelLoading, cancelError, onCancel, onEdit, onBack, onBookNew }: {
  email: string; bookings: SimpleBooking[];
  confirmCancelId: string | null; setConfirmCancelId: (id: string | null) => void;
  cancelLoading: boolean; cancelError: string;
  onCancel: (id: string) => void; onEdit: (b: SimpleBooking) => void;
  onBack: () => void; onBookNew: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`${vulfMono.className} text-sm text-neutral-500`}>
          Upcoming bookings for <span className="text-neutral-800 font-medium">{email}</span>
        </p>
        <button onClick={onBack} className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
          Different email
        </button>
      </div>

      {bookings.length === 0 && (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
          <p className={`${vulfMono.className} text-sm text-neutral-400`}>No upcoming bookings found for this email.</p>
          <button onClick={onBookNew} className={`${vulfMono.className} inline-block mt-4 text-sm underline text-[#884A20] underline-offset-2`}>
            Book a session →
          </button>
        </div>
      )}

      {bookings.map((b) => {
        const editable = isBookingEditable(b.date, b.time_slot);
        const isConfirmingCancel = confirmCancelId === b.id;
        return (
          <div key={b.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
            <div className={`${vulfMono.className} text-sm`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-base">{formatDateLong(b.date)}</p>
                  <p className="text-neutral-500 mt-0.5">{b.time_slot} · {b.party_size} {b.party_size === 1 ? "person" : "people"}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PaymentBadge method={b.payment_method} />
                  {!editable && <span className="text-[11px] text-neutral-300">Past</span>}
                </div>
              </div>
            </div>

            {editable && !isConfirmingCancel && (
              <div className="flex gap-2 pt-1 border-t border-black/5">
                <button onClick={() => onEdit(b)} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50`}>Edit booking</button>
                <button onClick={() => setConfirmCancelId(b.id)} className={`${vulfMono.className} flex-1 rounded-xl border border-red-200 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50`}>Cancel</button>
              </div>
            )}

            {editable && isConfirmingCancel && (
              <div className="pt-1 border-t border-black/5 space-y-3">
                <p className={`${vulfMono.className} text-xs text-neutral-600`}>
                  Cancel your reservation for <strong>{formatDateShort(b.date)}</strong> at <strong>{b.time_slot}</strong>? This cannot be undone.
                </p>
                {cancelError && <p className={`${vulfMono.className} text-xs text-red-500`}>{cancelError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setConfirmCancelId(null)} disabled={cancelLoading} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-2.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50`}>Keep it</button>
                  <button onClick={() => onCancel(b.id)} disabled={cancelLoading} className={`${vulfMono.className} flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60`}>
                    {cancelLoading ? "Cancelling…" : "Yes, cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Manage: Edit Flow ─────────────────────────────────────────────────────────

function EditFlow({ booking, step, setStep, calMonth, setCalMonth, fullDates, newDate, setNewDate, slots, slotsLoading, newSlot, setNewSlot, newPartySize, setNewPartySize, saveLoading, saveError, onBack, onSave }: {
  booking: SimpleBooking; step: EditStep; setStep: (s: EditStep) => void;
  calMonth: Date; setCalMonth: (d: Date) => void; fullDates: Set<string>;
  newDate: string; setNewDate: (d: string) => void;
  slots: SlotInfo[]; slotsLoading: boolean;
  newSlot: string; setNewSlot: (s: string) => void;
  newPartySize: number; setNewPartySize: (n: number) => void;
  saveLoading: boolean; saveError: string; onBack: () => void; onSave: () => void;
}) {
  const unchanged = newDate === booking.date && newSlot === booking.time_slot && newPartySize === booking.party_size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Editing booking</p>
          <p className={`${vulfMono.className} text-sm text-neutral-600 mt-0.5`}>
            Currently: {formatDateShort(booking.date)} at {booking.time_slot} · {booking.party_size} {booking.party_size === 1 ? "person" : "people"}
          </p>
        </div>
        <button onClick={onBack} className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>Back</button>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-5`}>New date</p>
            <Calendar calMonth={calMonth} setCalMonth={setCalMonth} fullDates={fullDates} selectedDate={newDate} onDateClick={setNewDate} />
          </div>
          {newDate && (
            <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
              <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-1`}>New time</p>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>{formatDateLong(newDate)}</p>
              {slotsLoading && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>Loading…</p>}
              {!slotsLoading && slots.length === 0 && <p className={`${vulfMono.className} text-sm text-neutral-400 py-4 text-center`}>No available times for this date.</p>}
              {!slotsLoading && slots.length > 0 && <SlotGrid slots={slots} selectedSlot={newSlot} onSelect={setNewSlot} />}
            </div>
          )}
          <button onClick={() => setStep(2)} disabled={!newDate || !newSlot}
            className={`${vulfMono.className} w-full rounded-xl py-3 text-sm tracking-[0.15em] font-semibold text-white transition-opacity ${newDate && newSlot ? "bg-[#884A20] hover:opacity-90" : "bg-neutral-300 cursor-not-allowed"}`}>
            CONTINUE
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-6">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Party size</p>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setNewPartySize(Math.max(1, newPartySize - 1))} className="w-12 h-12 rounded-xl border border-black/20 flex items-center justify-center text-xl hover:bg-neutral-50">−</button>
            <span className={`${vulfMono.className} text-3xl font-bold w-10 text-center`}>{newPartySize}</span>
            <button type="button" onClick={() => setNewPartySize(Math.min(MAX_PARTY_SIZE, newPartySize + 1))} className="w-12 h-12 rounded-xl border border-black/20 flex items-center justify-center text-xl hover:bg-neutral-50">+</button>
            <span className={`${vulfMono.className} text-sm text-neutral-400`}>{newPartySize === 1 ? "person" : "people"}</span>
          </div>
          <p className={`${vulfMono.className} text-xs text-neutral-300`}>Max {MAX_PARTY_SIZE} per booking</p>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50`}>Back</button>
            <button onClick={() => setStep(3)} className={`${vulfMono.className} flex-[2] rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90`}>CONTINUE</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
            <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400`}>Review changes</p>
            <div className={`${vulfMono.className} text-sm space-y-3`}>
              <ChangeRow label="Date" before={formatDateShort(booking.date)} after={formatDateShort(newDate)} changed={newDate !== booking.date} />
              <ChangeRow label="Time" before={booking.time_slot} after={newSlot} changed={newSlot !== booking.time_slot} />
              <ChangeRow label="Party" before={`${booking.party_size} ${booking.party_size === 1 ? "person" : "people"}`} after={`${newPartySize} ${newPartySize === 1 ? "person" : "people"}`} changed={newPartySize !== booking.party_size} />
            </div>
            {unchanged && <p className={`${vulfMono.className} text-xs text-neutral-400 pt-2 border-t border-black/5`}>No changes made.</p>}
          </div>
          {saveError && <p className={`${vulfMono.className} text-xs text-red-500 text-center`}>{saveError}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} disabled={saveLoading} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-50`}>Back</button>
            <button onClick={onSave} disabled={saveLoading || unchanged}
              className={`${vulfMono.className} flex-[2] rounded-xl py-3 text-sm tracking-[0.15em] font-semibold text-white transition-opacity ${unchanged ? "bg-neutral-300 cursor-not-allowed" : "bg-[#519A70] hover:opacity-90 disabled:opacity-60"}`}>
              {saveLoading ? "Saving…" : "SAVE CHANGES"}
            </button>
          </div>
        </div>
      )}
    </div>
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
