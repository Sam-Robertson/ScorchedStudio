// lib/course-webhooks.ts
// Handler for the course-enrollment Stripe webhook event. Kept separate from
// the webhook route so that file stays a thin signature-verify-and-dispatch
// shell, mirroring lib/create-booking-from-intent.ts and
// lib/membership-webhooks.ts's split for the other two payment flows.
import Stripe from "stripe";
import { Resend } from "resend";
import {
  addToWaitlist,
  enrollInCohort,
  formatSessionDate,
  formatSessionTime,
  getCohortWithCourse,
  getSessionsForCohort,
} from "@/lib/courses";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export async function handleCourseCheckoutCompleted(session: Stripe.Checkout.Session) {
  // The membership flow also creates Checkout Sessions, in mode:
  // "subscription". Once this webhook route dispatches checkout.session.completed
  // here, it needs to ignore anything that isn't a course enrollment.
  if (session.mode !== "payment") return;

  const cohortId = session.metadata?.cohort_id;
  if (!cohortId) return; // not a course checkout (e.g. a future non-course one-time payment type)

  const name = session.metadata?.name;
  const email = session.metadata?.email;
  if (!name || !email) {
    console.error("COURSE_WEBHOOK_MISSING_METADATA", session.id, session.metadata);
    return;
  }
  const phone = session.metadata?.phone || null;

  const paymentIntentId = idOf(session.payment_intent);
  const amountPaidCents = session.amount_total ?? 0;

  const enrollment = await enrollInCohort({
    cohort_id: cohortId,
    name,
    email: email.toLowerCase().trim(),
    phone,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    amount_paid_cents: amountPaidCents,
  });

  const found = await getCohortWithCourse(cohortId);
  if (!found) {
    console.error("COURSE_WEBHOOK_UNKNOWN_COHORT", cohortId, session.id);
    return;
  }
  const { cohort, course } = found;

  if (!enrollment) {
    // Oversold: the pre-payment check in the checkout route passed, but the
    // atomic enroll_in_cohort() guard didn't — someone else took the last
    // seat while this customer was on Stripe's page. Refund first (so we
    // know before telling the customer anything), then waitlist them.
    if (paymentIntentId) {
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      } catch (err) {
        console.error("COURSE_OVERSELL_REFUND_ERROR", session.id, paymentIntentId, err);
        // Don't waitlist or email on an unknown refund state — this needs a
        // human to look at Stripe directly before anything else happens.
        return;
      }
    }

    await addToWaitlist({ cohort_id: cohortId, name, email: email.toLowerCase().trim(), phone });

    await resend.emails.send({
      from: "Scorched Studio <courses@scorchedstudio.com>",
      to: email,
      subject: `${course.name} — that cohort just filled up`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
          <h1 style="font-size: 22px; margin-bottom: 8px;">Sorry, ${name.split(" ")[0]} — that seat just went</h1>
          <p style="color: #555; margin-bottom: 16px;">
            Someone else completed checkout for the last seat in the <strong>${cohort.label}</strong> cohort of
            <strong>${course.name}</strong> right around the same time as you.
          </p>
          <p style="color: #555; font-size: 14px; margin-bottom: 16px;">
            A full refund of <strong>$${(amountPaidCents / 100).toFixed(2)}</strong> has been issued to your
            original payment method — it typically appears within 5–10 business days.
          </p>
          <p style="color: #555; font-size: 14px;">
            We've added you to the waitlist for this cohort and will reach out if a seat opens up.
          </p>
          <p style="color: #aaa; font-size: 12px; margin-top: 24px;">Please do not reply to this email — it is not monitored.</p>
          <p style="color: #555; font-size: 14px; margin-top: 12px;">— The Scorched Studio Team</p>
        </div>
      `,
    }).catch((err) => console.error("COURSE_OVERSELL_EMAIL_ERROR", session.id, err));

    return;
  }

  // Confirmed — send the enrollment confirmation with the session schedule.
  const sessions = await getSessionsForCohort(cohortId);
  const sessionRows = sessions
    .map(
      (s) =>
        `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #888; width: 30%;">Week ${s.session_number}</td><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">${formatSessionDate(s.session_date)}, ${formatSessionTime(s.start_time)}–${formatSessionTime(s.end_time)}</td></tr>`
    )
    .join("");

  await resend.emails.send({
    from: "Scorched Studio <courses@scorchedstudio.com>",
    to: email,
    subject: `You're enrolled: ${course.name} (${cohort.label})`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">You're in, ${name.split(" ")[0]}!</h1>
        <p style="color: #555; margin-bottom: 20px;">
          You're enrolled in <strong>${course.name}</strong> — <strong>${cohort.label}</strong> cohort.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">${sessionRows}</table>
        <p style="color: #555; font-size: 14px;">Total paid: <strong>$${(amountPaidCents / 100).toFixed(2)}</strong></p>
        <p style="color: #555; font-size: 14px; margin-top: 16px;">
          Each person needs to sign a waiver before their first session —
          <a href="https://scorchedstudio.com/waiver" style="color: #884A20;">sign here</a> if you haven't already.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 24px;">Please do not reply to this email — it is not monitored.</p>
        <p style="color: #555; font-size: 14px; margin-top: 12px;">— The Scorched Studio Team</p>
      </div>
    `,
  }).catch((err) => console.error("COURSE_CONFIRMATION_EMAIL_ERROR", session.id, err));
}
