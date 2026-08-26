// app/api/webhooks/stripe/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createBookingFromIntent } from "@/lib/create-booking-from-intent";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleSubscriptionSync,
} from "@/lib/membership-webhooks";
import { handleCourseCheckoutCompleted } from "@/lib/course-webhooks";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("STRIPE_WEBHOOK_SIG_ERROR", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // payment_intent.succeeded — fired by Payment Element flow
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const result = await createBookingFromIntent(intent.id);
    if (!result.ok) {
      console.error("WEBHOOK_CREATE_BOOKING_ERROR", result.error);
    }
    return Response.json({ ok: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      // Two independent one-time-purchase flows share this event type —
      // each handler bails immediately if the session isn't theirs (mode
      // mismatch, or no cohort_id metadata), so it's safe to call both.
      await handleCheckoutSessionCompleted(session);
      await handleCourseCheckoutCompleted(session);
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionSync(subscription.id);
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    }
  } catch (err) {
    console.error("MEMBERSHIP_WEBHOOK_ERROR", event.type, err);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
