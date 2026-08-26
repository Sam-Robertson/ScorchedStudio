// app/api/account/login/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { sendLoginEmail } from "@/lib/customer-notify";

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
    await sendLoginEmail(email, parsed.data.redirectTo);
  } catch (err) {
    console.error("ACCOUNT_LOGIN_SEND_ERROR", err);
    // Don't reveal send failures either — same "always looks the same"
    // response as a successful send, so this can't be used to probe emails.
  }

  return Response.json({ ok: true });
}
