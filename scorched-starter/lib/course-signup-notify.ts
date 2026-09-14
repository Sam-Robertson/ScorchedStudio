// lib/course-signup-notify.ts (server-only)
//
// Emails staff when someone enrolls in a course cohort, so a signup doesn't
// sit unnoticed until someone opens that cohort's roster.
import { Resend } from "resend";
import {
  getCohortAvailability,
  type CohortRecord,
  type CourseEnrollmentRecord,
  type CourseRecord,
} from "@/lib/courses";

const RECIPIENTS = ["sam@scorchedstudio.com"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Called from the Stripe webhook after the enrollment row exists. Never
// throws: a throw there turns into a 500, Stripe retries, and the customer
// gets their confirmation email a second time.
export async function notifyCourseEnrollment(params: {
  course: CourseRecord;
  cohort: CohortRecord;
  enrollment: CourseEnrollmentRecord;
}) {
  try {
    if (!process.env.CONTACT_FROM) {
      console.error("COURSE_SIGNUP_NOTIFY_MISSING_CONTACT_FROM");
      return;
    }

    const { course, cohort, enrollment } = params;
    const availability = await getCohortAvailability(cohort.id);
    const seatsLine = availability
      ? `${availability.confirmed_count} of ${availability.capacity} seats filled`
      : "";

    const resend = new Resend(process.env.RESEND_API_KEY);
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #3A3A3A;">
        <p style="font-size: 14px; margin-bottom: 4px;">
          <strong>${escapeHtml(enrollment.name)}</strong> enrolled in <strong>${escapeHtml(course.name)}</strong>
        </p>
        <p style="font-size: 12px; color: #888; margin-bottom: 16px;">
          ${escapeHtml(cohort.label)} cohort${seatsLine ? ` &middot; ${seatsLine}` : ""}
        </p>
        <div style="background: #f7f6f3; border-radius: 10px; padding: 14px 16px; font-size: 14px; margin-bottom: 20px;">
          ${escapeHtml(enrollment.email)}<br />
          ${enrollment.phone ? `${escapeHtml(enrollment.phone)}<br />` : ""}
          Paid $${(enrollment.amount_paid_cents / 100).toFixed(2)}
        </div>
        <a href="https://scorchedstudio.com/admin/courses/${course.id}?cohort=${cohort.id}" style="font-size: 13px; color: #884A20;">View roster</a>
      </div>
    `;

    // resend.emails.send() resolves with { data, error } instead of throwing
    // on API-level failures (bad recipient, unverified domain, etc.), so each
    // send's error must be checked explicitly or a failure would go silent.
    await Promise.all(
      RECIPIENTS.map(async (to) => {
        const { error } = await resend.emails.send({
          from: process.env.CONTACT_FROM!,
          to,
          subject: `New course signup: ${enrollment.name}, ${course.name} (${cohort.label})`,
          html,
        });
        if (error) console.error("COURSE_SIGNUP_NOTIFY_SEND_ERROR", to, error);
      })
    );
  } catch (err) {
    console.error("COURSE_SIGNUP_NOTIFY_ERROR", params.enrollment.id, err);
  }
}
