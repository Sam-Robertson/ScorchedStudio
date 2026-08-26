// app/api/admin/courses/cohorts/[id]/waitlist/[waitlistId]/notify/route.ts
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/admin-session";
import { getCohortWithCourse, markWaitlistNotified } from "@/lib/courses";
import { getSupabase } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

// Emails a checkout link for the cohort — does not reserve a seat. Whoever
// completes checkout first wins via enroll_in_cohort, same as any other
// customer; this just moves one waitlisted person to the front of the line
// to try.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; waitlistId: string }> }
) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: cohortId, waitlistId } = await params;

  const { data: entry, error } = await getSupabase()
    .from("course_waitlist")
    .select("*")
    .eq("id", waitlistId)
    .eq("cohort_id", cohortId)
    .maybeSingle();
  if (error) {
    console.error("ADMIN_WAITLIST_NOTIFY_FETCH_ERROR", error);
    return Response.json({ error: "Failed to load waitlist entry." }, { status: 500 });
  }
  if (!entry) {
    return Response.json({ error: "Waitlist entry not found." }, { status: 404 });
  }

  const found = await getCohortWithCourse(cohortId);
  if (!found) {
    return Response.json({ error: "Cohort not found." }, { status: 404 });
  }
  const { cohort, course } = found;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scorchedstudio.com";
  const checkoutLink = `${baseUrl}/courses/${course.slug}?cohort=${cohort.id}`;

  try {
    const { error: sendError } = await resend.emails.send({
      from: "Scorched Studio <courses@scorchedstudio.com>",
      to: entry.email,
      subject: `A seat opened up in ${course.name} (${cohort.label})`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
          <h1 style="font-size: 22px; margin-bottom: 8px;">Good news, ${entry.name.split(" ")[0]}!</h1>
          <p style="color: #555; margin-bottom: 20px;">
            A seat opened up in the <strong>${cohort.label}</strong> cohort of <strong>${course.name}</strong>
            you were waitlisted for. It's first-come, first-served — grab it here:
          </p>
          <p style="text-align: center; margin-bottom: 20px;">
            <a href="${checkoutLink}" style="display: inline-block; background: #884A20; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
              Enroll now
            </a>
          </p>
          <p style="color: #aaa; font-size: 12px; margin-top: 24px;">Please do not reply to this email — it is not monitored.</p>
          <p style="color: #555; font-size: 14px; margin-top: 12px;">— The Scorched Studio Team</p>
        </div>
      `,
    });
    if (sendError) {
      console.error("ADMIN_WAITLIST_NOTIFY_SEND_ERROR", sendError);
      return Response.json({ error: "Failed to send notification email." }, { status: 500 });
    }
  } catch (err) {
    console.error("ADMIN_WAITLIST_NOTIFY_SEND_ERROR", err);
    return Response.json({ error: "Failed to send notification email." }, { status: 500 });
  }

  const updated = await markWaitlistNotified(waitlistId);
  return Response.json(updated);
}
