// app/api/courses/waitlist/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { addToWaitlist, getCohortById } from "@/lib/courses";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";

const schema = z.object({
  cohort_id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const customerSession = token ? verifyCustomerSessionToken(token) : null;
  if (!customerSession) {
    return Response.json({ error: "Please log in to join the waitlist.", requiresLogin: true }, { status: 401 });
  }
  const email = customerSession.email;

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

  try {
    const entry = await addToWaitlist({
      cohort_id,
      name,
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
    });
    return Response.json(entry, { status: 201 });
  } catch (err) {
    console.error("COURSE_WAITLIST_CREATE_ERROR", err);
    return Response.json({ error: "Failed to join waitlist." }, { status: 500 });
  }
}
