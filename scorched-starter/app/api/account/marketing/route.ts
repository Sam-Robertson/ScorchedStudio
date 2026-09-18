// app/api/account/marketing/route.ts
//
// Marketing preferences for the signed-in customer. Authenticated by the
// customer session cookie, the same way the membership cancel route is.
import { NextRequest } from "next/server";
import { z } from "zod";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import {
  getAccountMarketingPrefs,
  updateAccountMarketingPrefs,
} from "@/lib/marketing/account-preferences";
import { consentMetaFrom } from "@/lib/marketing/request-meta";

const schema = z.object({
  emailOptIn: z.boolean(),
  smsOptIn: z.boolean(),
  phone: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;
  if (!session) return Response.json({ error: "Not logged in." }, { status: 401 });

  try {
    return Response.json(await getAccountMarketingPrefs(session.email));
  } catch (err) {
    console.error("ACCOUNT_MARKETING_GET_ERROR", err);
    return Response.json({ error: "Could not load your preferences." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;
  if (!session) return Response.json({ error: "Not logged in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  try {
    const { ip, userAgent } = consentMetaFrom(req);
    const result = await updateAccountMarketingPrefs({
      email: session.email,
      emailOptIn: parsed.data.emailOptIn,
      smsOptIn: parsed.data.smsOptIn,
      phone: parsed.data.phone,
      ip,
      userAgent,
    });

    if (!result.ok) {
      return Response.json(
        {
          error:
            result.reason === "phone-invalid"
              ? "That does not look like a mobile number we can text."
              : "Add a mobile number so we know where to text you.",
        },
        { status: 400 }
      );
    }

    return Response.json(result.prefs);
  } catch (err) {
    console.error("ACCOUNT_MARKETING_PATCH_ERROR", err);
    return Response.json({ error: "Could not save your preferences." }, { status: 500 });
  }
}
