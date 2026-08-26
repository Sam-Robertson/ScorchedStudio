// app/api/account/forgot-password/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCustomerByEmail } from "@/lib/customers";
import { sendPasswordResetEmail } from "@/lib/customer-notify";

// redirectTo must be a relative path (starts with "/", not "//") — enforced
// here so a caller can't turn this into an open redirect via the emailed link.
const schema = z.object({
  email: z.string().email(),
  redirectTo: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  try {
    const customer = await getCustomerByEmail(email);
    // Only sends if the account actually exists, but the response is
    // identical either way — this can't be used to probe which emails
    // have accounts.
    if (customer) await sendPasswordResetEmail(email, parsed.data.redirectTo);
  } catch (err) {
    console.error("ACCOUNT_FORGOT_PASSWORD_ERROR", err);
  }

  return Response.json({ ok: true });
}
