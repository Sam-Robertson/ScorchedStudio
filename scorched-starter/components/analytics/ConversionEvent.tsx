"use client";

// Fires a conversion from a server-rendered success page. Renders nothing.
// The helpers in lib/analytics dedupe per transaction, so a reload of the
// success page does not count the sale twice.
import { useEffect, useRef } from "react";
import { trackBookingConfirmed, trackCourseEnrolled, trackMembershipStarted } from "@/lib/analytics";

type Props =
  | {
      kind: "booking";
      bookingId: string;
      valueCents: number;
      expectedCents: number;
      partySize: number;
      paymentMethod: string | null;
      location: string;
    }
  | { kind: "course"; sessionId: string; valueCents: number; courseName: string }
  | { kind: "membership"; sessionId: string; valueCents: number; planName: string };

export default function ConversionEvent(props: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (props.kind === "booking") trackBookingConfirmed(props);
    else if (props.kind === "course") trackCourseEnrolled(props);
    else trackMembershipStarted(props);
    // Fire once per mount; the payload is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
