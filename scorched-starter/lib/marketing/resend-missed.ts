// lib/marketing/resend-missed.ts
//
// Works out who never received a campaign that is marked sent.
//
// A send can stop partway: the provider's daily quota ran out on the launch
// email after two of six batches, and the campaign was still marked sent
// because the send route finished without throwing. The provider's own
// delivery events are the record of who it actually accepted, so the people
// to reach are the current audience minus anyone with such an event.
import type { SubscriberRecord } from "@/lib/supabase";

// Any of these means the provider took the message. Bounces and complaints
// count too: the message reached the provider and that address must not be
// tried again.
export const ACCEPTED_EVENT_TYPES = [
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
] as const;

export function missedRecipients(
  audience: SubscriberRecord[],
  acceptedEmails: Iterable<string>
): SubscriberRecord[] {
  const seen = new Set<string>();
  for (const e of acceptedEmails) seen.add(e.trim().toLowerCase());
  return audience.filter((s) => s.email && !seen.has(s.email.trim().toLowerCase()));
}
