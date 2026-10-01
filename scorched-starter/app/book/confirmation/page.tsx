// app/book/confirmation/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { getSupabase } from "@/lib/supabase";
import { createBookingFromIntent } from "@/lib/create-booking-from-intent";
import { manageBookingPath } from "@/lib/booking-link";
import { isUnpaidReservation } from "@/lib/booking-rules";

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
        manageHref={manageBookingPath(booking.id)}
        canPayOnline={isUnpaidReservation(booking)}
        name={booking.name}
        email={booking.email}
        formattedDate={formattedDate}
        timeSlot={booking.time_slot}
        partySize={booking.party_size}
        total={booking.amount_paid > 0 ? `$${(booking.amount_paid / 100).toFixed(2)}` : null}
        paymentNote={paymentNote}
      />
    );
  }

  return <ErrorView message="No booking found." />;
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function ConfirmationLayout({
  manageHref, canPayOnline, name, email, formattedDate, timeSlot, partySize, total, paymentNote,
}: {
  manageHref: string;
  canPayOnline: boolean;
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
            <p className={`${vulfMono.className} text-neutral-500 text-sm mt-2 break-words`}>
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

          {/* Says outright that changes happen on this booking, because people
              who wanted to pay or mention a gift card used to book again. */}
          <div className="mt-4 rounded-2xl border border-black/10 bg-white shadow-sm p-5">
            <p className={`${vulfMono.className} text-sm font-bold mb-1`}>Need to change something?</p>
            <p className={`${vulfMono.className} text-sm text-neutral-600`}>
              {canPayOnline
                ? "Pay ahead, switch to a gift card, change your time or party size, or cancel."
                : "Change your time or party size, or cancel."}{" "}
              It all happens on this booking, so there is no need to make a new one.
            </p>
            <a
              href={manageHref}
              className={`${vulfMono.className} inline-block mt-3 rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.1em] font-semibold text-white hover:opacity-90`}
            >
              EDIT BOOKING
            </a>
          </div>

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
          <div className="mt-4 rounded-2xl border border-[#519A70] bg-white shadow-sm p-5">
            <p className={`${vulfMono.className} text-sm font-bold mb-1`}>Join Scorched VIP</p>
            <p className={`${vulfMono.className} text-sm text-neutral-600`}>
              Free to join. Get exclusive deals, hear about new products first, and pick up a free
              wooden ring on your next visit.{" "}
              <Link href="/scorched-vip" className="underline text-[#884A20]">Sign up →</Link>
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 mt-8">
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
