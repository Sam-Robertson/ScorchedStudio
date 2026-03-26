// app/api/bookings/confirm-payment/route.ts
import { NextRequest } from "next/server";
import { createBookingFromIntent } from "@/lib/create-booking-from-intent";

export async function POST(req: NextRequest) {
  const { paymentIntentId } = await req.json();

  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    return Response.json({ error: "paymentIntentId required" }, { status: 400 });
  }

  const result = await createBookingFromIntent(paymentIntentId);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ booking_id: result.booking_id });
}
