// lib/member-account.ts - server-only
//
// Every member must have an account, because the account page is the only
// place they can see their entrances and renewal date. Checkout now requires
// one up front; this is the safety net for memberships that arrive without
// one (bought before that rule, or set up by staff).
import { randomBytes } from "crypto";
import { createCustomer, getCustomerByEmail } from "@/lib/customers";
import { hashPassword } from "@/lib/customer-password";
import { sendMemberAccountInviteEmail } from "@/lib/customer-notify";

// Creates the account with an unguessable placeholder password and emails a
// set-password link. Does nothing when an account already exists, so it is
// safe to call on every membership event. Never throws: a membership must be
// recorded even if the invite cannot be sent.
export async function ensureMemberAccount(email: string, planName: string): Promise<"existing" | "invited" | "failed"> {
  const normalized = email.toLowerCase().trim();
  try {
    if (await getCustomerByEmail(normalized)) return "existing";
    await createCustomer(normalized, hashPassword(randomBytes(32).toString("hex")));
    await sendMemberAccountInviteEmail(normalized, planName);
    return "invited";
  } catch (err) {
    console.error("MEMBER_ACCOUNT_ENSURE_ERROR", normalized, err);
    return "failed";
  }
}
