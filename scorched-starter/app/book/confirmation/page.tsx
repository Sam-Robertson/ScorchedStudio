// app/book/confirmation/page.tsx
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getSupabase } from "@/lib/supabase";
import { createBookingFromIntent } from "@/lib/create-booking-from-intent";

export const metadata = {
  title: "Booking Confirmed | Scorched Studio",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ booking_id?: string; payment_intent?: string }>;
}) {
  const { booking_id, payment_intent } = await searchParams;

  // ── Payment Element redirect case ───────────────────────────────────────────
  // Rare: fires when a redirect-based payment method is used instead of a card.
  if (payment_intent) {
    const result = await createBookingFromIntent(payment_intent);
    if (result.ok) {
      redirect(`/book/confirmation?booking_id=${result.booking_id}`);
    }
    return <ErrorView message="Payment received but booking could not be confirmed. Please contact us." />;
  }

  // ── Free reservation (reserve route) ───────────────────────────────────────
  if (booking_id) {
    const { data: booking } = await getSupabase()
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (!booking) return <ErrorView message="Reservation not found." />;

    const formattedDate = new Date(booking.date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    const paymentNote =
      booking.payment_method === "gift_card"
        ? "Remember to bring your gift card — the $15/person studio fee is due in-studio."
        : booking.payment_method === "get_out_pass"
        ? "Remember to bring your Get Out Pass when you arrive."
        : null;

    return (
      <ConfirmationLayout
        bookingId={booking.id}
        name={booking.name}
        email={booking.email}
        formattedDate={formattedDate}
        timeSlot={booking.time_slot}
        partySize={booking.party_size}
        total={null}
        paymentNote={paymentNote}
      />
    );
  }

  return <ErrorView message="No booking found." />;
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function ConfirmationLayout({
  bookingId, name, email, formattedDate, timeSlot, partySize, total, paymentNote,
}: {
  bookingId: string;
  name: string;
  email: string;
  formattedDate: string;
  timeSlot: string;
  partySize: number;
  total: string | null;
  paymentNote: string | null;
}) {
  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16">
        <Container className="max-w-lg">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#519A70] flex items-center justify-center text-white text-2xl font-bold mb-4">
              ✓
            </div>
            <p className="eyebrow text-brand">You&apos;re all set</p>
            <h1 className="h2 font-bold">{total ? "Booking Confirmed" : "Spot Reserved"}</h1>
            <p className={`${vulfMono.className} text-neutral-500 text-sm mt-2`}>
              A confirmation email has been sent to {email}
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-6 space-y-3">
            <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-2`}>
              {total ? "Booking details" : "Reservation details"}
            </p>
            <div className={`${vulfMono.className} text-sm space-y-3`}>
              <Row label="Name" value={name} />
              <Row label="Date" value={formattedDate} />
              <Row label="Time" value={timeSlot} />
              <Row label="Party" value={`${partySize} ${partySize === 1 ? "person" : "people"}`} />
              {total && <Row label="Total" value={total} />}
            </div>
          </div>

          {paymentNote && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className={`${vulfMono.className} text-sm text-amber-800`}>{paymentNote}</p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-black/10 bg-[#F7F6F3] p-5">
            <p className={`${vulfMono.className} text-sm font-bold mb-1`}>Studio Location</p>
            <p className={`${vulfMono.className} text-sm text-neutral-600`}>
              218 E University Pkwy, Orem, UT 84058
            </p>
            <p className={`${vulfMono.className} text-xs text-neutral-400 mt-3`}>
              Each person needs to sign a waiver before their first visit.{" "}
              <a href="/waiver" className="underline text-[#884A20]">Sign waiver →</a>
            </p>
          </div>

          {/* Scorched VIP */}
          <div className="mt-4">
            <p className={`${vulfMono.className} text-xs uppercase tracking-wider text-neutral-400 mb-3 text-center`}>
              Join Scorched VIP — it&apos;s free
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* QR Code */}
              <div className="rounded-2xl border border-[#519A70] bg-white p-4 shadow-sm flex flex-col items-center text-center">
                <p className="eyebrow text-brand text-[10px] mb-2">In Studio</p>
                <Image
                  src="/loyalty-qr.png"
                  alt="Scorched VIP sign-up QR code"
                  width={96}
                  height={96}
                  className="rounded-xl"
                />
                <p className={`${vulfMono.className} text-[11px] font-bold mt-2`}>Scan the QR Code</p>
                <p className={`${vulfMono.className} text-[11px] text-neutral-500 mt-1 leading-snug`}>
                  Find our VIP QR code at the front desk and scan to join instantly.
                </p>
              </div>

              {/* Text to Sign Up */}
              <div className="rounded-2xl border border-[#519A70] bg-white p-4 shadow-sm flex flex-col items-center text-center">
                <p className="eyebrow text-brand text-[10px] mb-2">From Anywhere</p>
                <div className="w-24 h-24 rounded-xl bg-[#F6E4E1] flex flex-col items-center justify-center gap-1">
                  <MessageSquare className="w-6 h-6 text-[#884A20]" />
                  <p className={`${vulfMono.className} text-base font-bold text-[#884A20]`}>Text Us</p>
                </div>
                <p className={`${vulfMono.className} text-[11px] font-bold mt-2`}>Text to Sign Up</p>
                <p className={`${vulfMono.className} text-[11px] text-neutral-500 mt-1 leading-snug`}>
                  Text <span className="font-bold text-[#884A20]">BURN</span> to{" "}
                  <span className="font-bold text-[#884A20]">(844) 952-0456</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 mt-8">
            <a
              href={`/book/manage?booking_id=${bookingId}`}
              className={`${vulfMono.className} text-sm text-[#884A20] underline underline-offset-2 hover:opacity-70`}
            >
              Need to reschedule or cancel? →
            </a>
            <Link href="/" className={`${vulfMono.className} text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}>
              Back to home
            </Link>
          </div>
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

function ErrorView({ message }: { message: string }) {
  return (
    <main className="pb-20">
      <Container className="max-w-lg py-20 text-center">
        <p className="text-neutral-600 mb-4">{message}</p>
        <a href="/book" className="underline text-[#884A20] text-sm">Book a session</a>
      </Container>
    </main>
  );
}
