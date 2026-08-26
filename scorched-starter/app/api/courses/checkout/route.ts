// app/api/courses/checkout/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getCohortAvailability, getCohortWithCourse } from "@/lib/courses";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const schema = z.object({
  cohort_id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { cohort_id, name, email, phone } = parsed.data;

  const found = await getCohortWithCourse(cohort_id);
  if (!found) {
    return Response.json({ error: "Cohort not found." }, { status: 404 });
  }
  const { cohort, course } = found;

  if (cohort.status !== "open") {
    return Response.json({ error: "This cohort isn't open for enrollment." }, { status: 409 });
  }

  // Best-effort check to fail fast for the common case — this narrows the
  // oversell window (two people checking out for the last seat at once) to
  // however long a customer sits on Stripe's hosted page, it doesn't close
  // it. The atomic guard is enroll_in_cohort(), called from the webhook after
  // payment succeeds; if that rejects anyway, the webhook auto-refunds and
  // waitlists the customer instead of leaving them charged with no seat.
  const availability = await getCohortAvailability(cohort_id);
  if (!availability || availability.seats_remaining <= 0) {
    return Response.json({ error: "This cohort is full.", full: true }, { status: 409 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `${course.name} — ${cohort.label} cohort` },
          unit_amount: cohort.price_cents,
        },
        quantity: 1,
      },
    ],
    // The webhook reads name/email/phone straight out of this metadata
    // rather than Stripe's own customer_details — we already collected
    // these on the course detail page before redirecting to Stripe.
    metadata: { cohort_id, name, email, phone: phone ?? "" },
    success_url: `${baseUrl}/courses/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/courses/${course.slug}`,
  });

  return Response.json({ url: session.url });
}
