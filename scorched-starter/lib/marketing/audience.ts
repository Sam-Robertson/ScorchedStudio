// lib/marketing/audience.ts — server only
//
// Resolves a campaign's segment into actual subscriber rows. Shared by the
// email sender, the SMS enqueue step, and the admin live recipient count, so
// the number shown in the confirm dialog is produced by the same query that
// decides who gets the message.
import { getSupabase } from "@/lib/supabase";
import type { CampaignSegment, MarketingChannel, SubscriberRecord } from "@/lib/supabase";

export async function audienceFor(
  channel: MarketingChannel,
  segment: CampaignSegment | null | undefined
): Promise<SubscriberRecord[]> {
  const sb = getSupabase();

  let query = sb.from("subscribers").select("*");

  if (channel === "email") {
    query = query.eq("email_status", "subscribed").not("email", "is", null);
  } else {
    query = query.eq("sms_status", "subscribed").not("phone", "is", null);
  }

  const tags = segment?.tags ?? [];
  if (tags.length > 0) {
    // contains() is the array superset operator (@>), overlaps() is the
    // intersection operator (&&). "all" means the subscriber carries every
    // listed tag; "any" means at least one.
    query = (segment?.match ?? "any") === "all" ? query.contains("tags", tags) : query.overlaps("tags", tags);
  }

  const { data, error } = await query;
  if (error) throw new Error(`audience query failed: ${error.message}`);
  return (data ?? []) as SubscriberRecord[];
}

export async function audienceCount(
  channel: MarketingChannel,
  segment: CampaignSegment | null | undefined
): Promise<number> {
  const sb = getSupabase();

  let query = sb.from("subscribers").select("id", { count: "exact", head: true });

  if (channel === "email") {
    query = query.eq("email_status", "subscribed").not("email", "is", null);
  } else {
    query = query.eq("sms_status", "subscribed").not("phone", "is", null);
  }

  const tags = segment?.tags ?? [];
  if (tags.length > 0) {
    query = (segment?.match ?? "any") === "all" ? query.contains("tags", tags) : query.overlaps("tags", tags);
  }

  const { count, error } = await query;
  if (error) throw new Error(`audience count failed: ${error.message}`);
  return count ?? 0;
}
