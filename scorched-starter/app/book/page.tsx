"use client";

import { useState, useEffect } from "react";
import MarketingOptIns, { EMPTY_OPT_INS, type OptInState } from "@/components/marketing/MarketingOptIns";
import { Elements } from "@stripe/react-stripe-js";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { MAX_PARTY_SIZE } from "@/lib/booking-rules";
import ManageBookings from "@/components/booking/ManageBookings";
import {
  Calendar,
  PaymentForm,
  SlotGrid,
  formatDateLong,
  inputCls,
  isPast,
  partyLabel,
  stripeAppearance,
  stripePromise,
  type SlotInfo,
} from "@/components/booking/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "book" | "manage";
type BookStep = 1 | 2 | 3;
type PaymentMethod = "gift_card" | null;

type LocationOption = { key: "orem" | "slc"; name: string };

// A booking this person already holds on the day they are booking.
type ExistingBooking = {
  id: string;
  date: string;
  time_slot: string;
  party_size: number;
  payment_method: string | null;
  amount_paid: number;
  location: "orem" | "slc";
  token: string | null;
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [tab, setTab] = useState<Tab>("book");

  // Read ?tab=manage from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "manage") setTab("manage");
  }, []);

  // ── Locations ────────────────────────────────────────────────────────────────
  const [bookableLocations, setBookableLocations] = useState<LocationOption[]>([{ key: "orem", name: "Orem" }]);
  const [location, setLocation] = useState<"orem" | "slc">("orem");

  useEffect(() => {
    // /locations links straight to a location's booking flow, so a valid
    // ?location= wins over the default first bookable location.
    const requested = new URLSearchParams(window.location.search).get("location");
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: LocationOption[] | null) => {
        if (rows && rows.length > 0) {
          setBookableLocations(rows);
          const match = rows.find((row) => row.key === requested);
          setLocation(match ? match.key : rows[0].key);
        }
      })
      .catch(() => {});
  }, []);

  // ── Book tab state ──────────────────────────────────────────────────────────
  const [bookStep, setBookStep] = useState<BookStep>(1);
  const [bookCalMonth, setBookCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [bookFullDates, setBookFullDates] = useState<Set<string>>(new Set());
  const [bookClosedDates, setBookClosedDates] = useState<Set<string>>(new Set());
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
  const [referralSource, setReferralSource] = useState("");
  const [referralOther, setReferralOther] = useState("");
  const [optIns, setOptIns] = useState<OptInState>(EMPTY_OPT_INS);

  // ── Already-booked check ────────────────────────────────────────────────────
  // Shown instead of the review step when this person already has a booking on
  // the chosen day, so they edit that one rather than making a second.
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[] | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  // Remembers "no, this is a separate booking" for one date and contact, so
  // going back and forward does not ask again.
  const [separateBookingKey, setSeparateBookingKey] = useState("");
  // The booking the Manage tab should open when sent there from that prompt.
  const [manageTarget, setManageTarget] = useState<{ id: string; token: string } | null>(null);

  // ── Book tab effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "book") return;
    const monthStr = `${bookCalMonth.getFullYear()}-${String(bookCalMonth.getMonth() + 1).padStart(2, "0")}`;
    fetch(`/api/bookings/availability?month=${monthStr}&location=${location}`)
      .then((r) => (r.ok ? r.json() : { fullDates: [], closedDates: [] }))
      .then((data) => {
        setBookFullDates(new Set(data.fullDates ?? []));
        setBookClosedDates(new Set(data.closedDates ?? []));
      })
      .catch(() => {});
  }, [bookCalMonth, tab, location]);

  useEffect(() => {
    if (!selectedDate || tab !== "book") return;
    setBookSlotsLoading(true);
    setBookSlots([]);
    fetch(`/api/bookings/availability?date=${selectedDate}&location=${location}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => { setBookSlots(data.slots ?? []); setBookSlotsLoading(false); })
      .catch(() => setBookSlotsLoading(false));
  }, [selectedDate, tab, location]);

  // Different location = different calendar; clear any in-progress date/time pick.
  function handleLocationChange(key: "orem" | "slc") {
    setLocation(key);
    setSelectedDate("");
    setSelectedSlot("");
  }

  // ── Book tab handlers ───────────────────────────────────────────────────────

  function handleDateClick(dateStr: string) {
    if (isPast(dateStr) || bookClosedDates.has(dateStr) || bookFullDates.has(dateStr)) return;
    if (dateStr === selectedDate) return;
    setSelectedDate(dateStr);
    setSelectedSlot("");
  }

  function handleStep1Continue() {
    if (!selectedDate || !selectedSlot) return;
    setBookStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Identifies "this person on this day" for the already-booked check.
  function existingCheckKey() {
    return `${selectedDate}|${email.trim().toLowerCase()}|${phone.replace(/\D/g, "")}`;
  }

  function goToReview() {
    setExistingBookings(null);
    setBookStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStep2Continue() {
    if (!name.trim()) { setFormError("Name is required."); return; }
    if (!email.trim()) { setFormError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError("Please enter a valid email address."); return; }
    if (!referralSource) { setFormError("Please tell us how you heard about us."); return; }
    if (referralSource === "Other" && !referralOther.trim()) { setFormError("Please specify how you heard about us."); return; }
    setFormError("");

    // People come back to pay, or to say they have a gift card, and book the
    // same visit twice. Catch that here, before they reach payment.
    if (existingCheckKey() !== separateBookingKey) {
      setCheckingExisting(true);
      try {
        const res = await fetch("/api/bookings/existing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, email: email.trim(), phone: phone || undefined }),
        });
        const data = res.ok ? await res.json() : { bookings: [] };
        if ((data.bookings ?? []).length > 0) {
          setExistingBookings(data.bookings);
          setCheckingExisting(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      } catch {
        // The check is a courtesy. If it fails, the booking carries on.
      }
      setCheckingExisting(false);
    }

    goToReview();
  }

  function handleEditExisting(b: ExistingBooking) {
    // Without a token the Manage tab falls back to its email lookup.
    setManageTarget(b.token ? { id: b.id, token: b.token } : null);
    setExistingBookings(null);
    setTab("manage");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSeparateBooking() {
    setSeparateBookingKey(existingCheckKey());
    goToReview();
  }

  async function handleInitiatePayment() {
    setPayLoading(true);
    setPayError("");
    try {
      const res = await fetch("/api/bookings/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, time_slot: selectedSlot, party_size: partySize, name, email, phone, referral_source: referralSource, referral_other: referralOther || undefined, location, emailOptIn: optIns.email, smsOptIn: optIns.sms }),
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
        body: JSON.stringify({ date: selectedDate, time_slot: selectedSlot, party_size: partySize, name, email, phone, payment_method: paymentMethod, referral_source: referralSource, referral_other: referralOther || undefined, location, emailOptIn: optIns.email, smsOptIn: optIns.sms }),
      });
      const data = await res.json();
      if (!res.ok) { setReserveError(data.error || "Something went wrong."); setReserveLoading(false); return; }
      window.location.href = `/book/confirmation?booking_id=${data.booking_id}`;
    } catch {
      setReserveError("Something went wrong. Please try again.");
      setReserveLoading(false);
    }
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
              ? "$15 per person · 90-minute sessions"
              : "Change your time or party size, pay ahead, or cancel"}
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
                locations={bookableLocations}
                location={location}
                onLocationChange={handleLocationChange}
                calMonth={bookCalMonth}
                setCalMonth={setBookCalMonth}
                fullDates={bookFullDates}
                closedDates={bookClosedDates}
                selectedDate={selectedDate}
                onDateClick={handleDateClick}
                slots={bookSlots}
                slotsLoading={bookSlotsLoading}
                selectedSlot={selectedSlot}
                setSelectedSlot={setSelectedSlot}
                onContinue={handleStep1Continue}
              />
            )}
            {bookStep === 2 && existingBookings && (
              <ExistingBookingNotice
                bookings={existingBookings}
                onEdit={handleEditExisting}
                onSeparate={handleSeparateBooking}
                onBack={() => setExistingBookings(null)}
              />
            )}
            {bookStep === 2 && !existingBookings && (
              <BookStep2
                name={name} setName={setName}
                email={email} setEmail={setEmail}
                phone={phone} setPhone={setPhone}
                partySize={partySize} setPartySize={setPartySize}
                referralSource={referralSource} setReferralSource={setReferralSource}
                referralOther={referralOther} setReferralOther={setReferralOther}
                optIns={optIns} setOptIns={setOptIns}
                error={formError}
                checking={checkingExisting}
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
          <ManageBookings
            key={manageTarget?.id ?? "lookup"}
            initialBookingId={manageTarget?.id}
            initialToken={manageTarget?.token}
            onBookNew={() => setTab("book")}
          />
        )}
      </Container>
    </main>
  );
}

// ── Book Step 1 ───────────────────────────────────────────────────────────────

function BookStep1({ locations, location, onLocationChange, calMonth, setCalMonth, fullDates, closedDates, selectedDate, onDateClick, slots, slotsLoading, selectedSlot, setSelectedSlot, onContinue }: {
  locations: LocationOption[]; location: "orem" | "slc"; onLocationChange: (key: "orem" | "slc") => void;
  calMonth: Date; setCalMonth: (d: Date) => void; fullDates: Set<string>; closedDates: Set<string>;
  selectedDate: string; onDateClick: (d: string) => void;
  slots: SlotInfo[]; slotsLoading: boolean;
  selectedSlot: string; setSelectedSlot: (s: string) => void; onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      {locations.length > 1 && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-4`}>Choose a location</p>
          <div className="flex gap-2">
            {locations.map((loc) => (
              <button
                key={loc.key}
                type="button"
                onClick={() => onLocationChange(loc.key)}
                className={`${vulfMono.className} flex-1 rounded-xl border py-3 text-sm font-medium transition-colors ${
                  location === loc.key
                    ? "border-[#884A20] bg-[#884A20] text-white"
                    : "border-black/15 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-5`}>Select a date</p>
        <Calendar calMonth={calMonth} setCalMonth={setCalMonth} fullDates={fullDates} closedDates={closedDates} selectedDate={selectedDate} onDateClick={onDateClick} />
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

const REFERRAL_OPTIONS = [
  "Get Out Pass",
  "Family/Friend",
  "TikTok",
  "In-Person/Drive by",
  "Returning Customer",
  "Instagram",
  "Google Search/Maps",
  "Other",
];

function BookStep2({ name, setName, email, setEmail, phone, setPhone, partySize, setPartySize, referralSource, setReferralSource, referralOther, setReferralOther, optIns, setOptIns, error, checking, onBack, onContinue }: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  partySize: number; setPartySize: (v: number) => void;
  referralSource: string; setReferralSource: (v: string) => void;
  referralOther: string; setReferralOther: (v: string) => void;
  optIns: OptInState; setOptIns: (v: OptInState) => void;
  error: string; checking: boolean; onBack: () => void; onContinue: () => void;
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
        <div>
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>How did you hear about Scorched Studio? <span className="text-red-400">*</span></label>
          <select
            className={inputCls}
            value={referralSource}
            onChange={(e) => { setReferralSource(e.target.value); setReferralOther(""); }}
          >
            <option value="">Select an option…</option>
            {REFERRAL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {referralSource === "Other" && (
            <input
              type="text"
              className={`${inputCls} mt-2`}
              value={referralOther}
              onChange={(e) => setReferralOther(e.target.value)}
              placeholder="Please specify…"
            />
          )}
        </div>
      </div>
      {/* Optional and unticked by default. Nothing here gates the booking. */}
      <div className="rounded-xl border border-black/10 bg-neutral-50 p-4">
        <p className={`${vulfMono.className} text-xs tracking-[0.15em] uppercase text-neutral-500 mb-3`}>
          Stay in the loop (optional)
        </p>
        <MarketingOptIns value={optIns} onChange={setOptIns} idPrefix="book" />
      </div>
      {error && <p className={`${vulfMono.className} text-xs text-red-500`}>{error}</p>}
      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50`}>Back</button>
        <button onClick={onContinue} disabled={checking} className={`${vulfMono.className} flex-[2] rounded-xl bg-[#884A20] py-3 text-sm tracking-[0.15em] font-semibold text-white hover:opacity-90 disabled:opacity-60`}>{checking ? "CHECKING…" : "CONTINUE"}</button>
      </div>
    </div>
  );
}

// ── Already booked that day ───────────────────────────────────────────────────

function ExistingBookingNotice({ bookings, onEdit, onSeparate, onBack }: {
  bookings: ExistingBooking[];
  onEdit: (b: ExistingBooking) => void;
  onSeparate: () => void;
  onBack: () => void;
}) {
  const one = bookings.length === 1;
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm space-y-5">
      <div>
        <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-amber-600`}>Heads up</p>
        <h2 className="h3 font-bold mt-1 leading-snug">
          You already have {one ? "a booking" : "bookings"} on {formatDateLong(bookings[0].date)}
        </h2>
        <p className={`${vulfMono.className} text-sm text-neutral-500 mt-2`}>
          Want to pay ahead, use a gift card, or change your time or party size? You can do all of that on the
          booking you already have. There is no need to make a second one.
        </p>
      </div>

      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="rounded-xl border border-black/10 bg-neutral-50 p-4">
            <p className={`${vulfMono.className} text-sm font-bold`}>{b.time_slot} · {partyLabel(b.party_size)}</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
              {b.amount_paid > 0
                ? `Paid $${(b.amount_paid / 100).toFixed(2)}`
                : b.payment_method === "gift_card"
                ? "Paying with a gift card in studio"
                : b.payment_method
                ? "Reserved"
                : "Reserved, not paid yet"}
            </p>
            <button
              onClick={() => onEdit(b)}
              className={`${vulfMono.className} mt-3 w-full rounded-xl bg-[#519A70] py-2.5 text-xs tracking-[0.1em] font-semibold text-white hover:opacity-90`}
            >
              {b.amount_paid === 0 && (!b.payment_method || b.payment_method === "gift_card") ? "EDIT OR PAY FOR THIS BOOKING" : "EDIT THIS BOOKING"}
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className={`${vulfMono.className} flex-1 rounded-xl border border-black/20 py-3 text-sm text-neutral-500 hover:bg-neutral-50`}>Back</button>
        <button onClick={onSeparate} className={`${vulfMono.className} flex-[2] rounded-xl border border-black/20 py-3 text-sm text-neutral-600 hover:bg-neutral-50`}>
          No, this is a separate booking
        </button>
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
  const payBlocked = paymentMethod === "gift_card";

  function toggleMethod(method: "gift_card") {
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
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>Reserve free, then pay the $15/person studio fee in-studio</p>
            </div>
          </label>
          {paymentMethod === "gift_card" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className={`${vulfMono.className} text-xs text-amber-800`}><strong>Note:</strong> Please bring your gift card when you arrive. The $15 per-person studio fee will be collected in-studio.</p>
            </div>
          )}
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-400 w-12 shrink-0">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}
