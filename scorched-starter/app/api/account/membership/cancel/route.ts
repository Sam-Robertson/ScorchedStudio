// app/api/account/membership/cancel/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import { getMembershipById } from "@/lib/memberships";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const schema = z.object({ membership_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;
  if (!session) {
    return Response.json({ error: "Not logged in." }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const membership = await getMembershipById(parsed.data.membership_id);
  if (!membership || membership.email !== session.email) {
    return Response.json({ error: "Membership not found." }, { status: 404 });
  }
  if (membership.status !== "active") {
    return Response.json({ error: "This membership isn't active." }, { status: 409 });
  }

  try {
    const subscription = await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    // Stripe SDK v20: current_period_end lives on each subscription item, not
    // on the subscription itself (same shape lib/membership-webhooks.ts
    // already accounts for).
    const periodEndSeconds = subscription.items.data[0]?.current_period_end;
    return Response.json({
      ok: true,
      current_period_end: periodEndSeconds ? new Date(periodEndSeconds * 1000).toISOString() : membership.current_period_end,
    });
  } catch (err) {
    console.error("ACCOUNT_MEMBERSHIP_CANCEL_ERROR", err);
    return Response.json({ error: "Failed to cancel membership. Please try again." }, { status: 500 });
  }
}
