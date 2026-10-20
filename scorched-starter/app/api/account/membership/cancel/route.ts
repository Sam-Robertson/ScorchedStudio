// app/api/account/membership/cancel/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import { getMembershipById, syncMembershipStatus } from "@/lib/memberships";
import { subscriptionSnapshot } from "@/lib/membership-webhooks";

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
  if (membership.cancel_at) {
    // Already scheduled: a second click (or a stale page) is not an error.
    return Response.json({ ok: true, cancel_at: membership.cancel_at });
  }

  try {
    const subscription = await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    // Write the scheduled end to our row right away rather than waiting on the
    // customer.subscription.updated webhook, so the account page reflects the
    // cancellation the moment it reloads. The webhook writes the same snapshot
    // again, which is harmless. Before this, nothing on our side changed and
    // the page kept showing Active with a cancel button.
    const snapshot = subscriptionSnapshot(subscription);
    try {
      await syncMembershipStatus({ stripe_subscription_id: subscription.id, ...snapshot });
    } catch (err) {
      // Stripe already has the cancellation, so the member must not be told it
      // failed. The webhook will bring the row up to date.
      console.error("ACCOUNT_MEMBERSHIP_CANCEL_SYNC_ERROR", err);
    }
    return Response.json({
      ok: true,
      cancel_at: snapshot.cancel_at ?? snapshot.current_period_end ?? membership.current_period_end,
    });
  } catch (err) {
    console.error("ACCOUNT_MEMBERSHIP_CANCEL_ERROR", err);
    return Response.json({ error: "Failed to cancel membership. Please try again." }, { status: 500 });
  }
}
