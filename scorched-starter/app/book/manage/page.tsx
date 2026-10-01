"use client";

// app/book/manage/page.tsx
//
// Where the "Edit your booking" link in booking emails lands. With the signed
// token from the link the booking opens directly; without one (a link from an
// older email, or someone typing the address) it asks for the booking email.
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import ManageBookings from "@/components/booking/ManageBookings";

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ManagePageInner />
    </Suspense>
  );
}

function ManagePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id") ?? undefined;
  const token = searchParams.get("t") ?? undefined;

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 pb-8">
        <Container>
          <p className="eyebrow text-brand text-center">Scorched Studio</p>
          <h1 className="h2 font-bold text-center">Manage Booking</h1>
          <p className={`${vulfMono.className} text-center text-neutral-500 mt-2 text-sm`}>
            Change your time or party size, pay ahead, or cancel
          </p>
        </Container>
      </section>

      <Container className="max-w-xl">
        <ManageBookings
          initialBookingId={bookingId}
          initialToken={token}
          onBookNew={() => router.push("/book")}
        />
      </Container>
    </main>
  );
}
