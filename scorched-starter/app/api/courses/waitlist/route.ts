// app/api/courses/waitlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addToWaitlist, getCohortById } from "@/lib/courses";
import { attachCustomerSession, resolveCustomerForCourseAction } from "@/lib/course-guest-account";

const schema = z.object({
  cohort_id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  // Guest signup, same shape as the checkout route.
  email: z.string().email().optional(),
  password: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { cohort_id, name, phone } = parsed.data;

  const cohort = await getCohortById(cohort_id);
  if (!cohort) {
    return Response.json({ error: "Cohort not found." }, { status: 404 });
  }

  const resolved = await resolveCustomerForCourseAction(req, {
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!resolved.ok) {
    return Response.json(resolved.body, { status: resolved.status });
  }
  const email = resolved.email;

  try {
    const entry = await addToWaitlist({
      cohort_id,
      name,
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
    });
    const response = NextResponse.json(entry, { status: 201 });
    return resolved.issueSession ? attachCustomerSession(response, email) : response;
  } catch (err) {
    console.error("COURSE_WAITLIST_CREATE_ERROR", err);
    return Response.json({ error: "Failed to join waitlist." }, { status: 500 });
  }
}
