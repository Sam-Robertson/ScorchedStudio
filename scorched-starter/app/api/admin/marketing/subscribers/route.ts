// app/api/admin/marketing/subscribers/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { SubscriberRecord } from "@/lib/supabase";
import { recordConsent } from "@/lib/marketing/consent";
import { ADMIN_UNSUBSCRIBE_CONSENT_TEXT } from "@/lib/marketing/consent-copy";
import { syncSubscriberToResend } from "@/lib/marketing/resend-audience";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const emailStatus = url.searchParams.get("emailStatus") ?? "";
  const smsStatus = url.searchParams.get("smsStatus") ?? "";
  const tag = url.searchParams.get("tag")?.trim() ?? "";

  try {
    // A short page: the list is for finding one person, not browsing all of
    // them, and the search box above it covers the rest. The count still
    // reports the full match so the page can say how many are not shown.
    let query = getSupabase()
      .from("subscribers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (search) {
      // Matches either channel, since staff searching for a person may have
      // only one of the two to hand.
      const escaped = search.replace(/[%,()]/g, "");
      const clauses = [
        `email.ilike.%${escaped}%`,
        `first_name.ilike.%${escaped}%`,
        `last_name.ilike.%${escaped}%`,
      ];
      // phone is stored as E.164, so a typed "801-361" or "(801) 361" would
      // never match it literally. Search the digits instead.
      const digits = search.replace(/\D/g, "");
      if (digits) clauses.push(`phone.ilike.%${digits}%`);
      query = query.or(clauses.join(","));
    }
    if (emailStatus) query = query.eq("email_status", emailStatus);
    if (smsStatus) query = query.eq("sms_status", smsStatus);
    if (tag) query = query.contains("tags", [tag]);

    const { data, error, count } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ subscribers: data as SubscriberRecord[], total: count ?? data?.length ?? 0 });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// Manual unsubscribe from the admin table.
export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, channel } = await req.json();
    if (!id || (channel !== "email" && channel !== "sms")) {
      return Response.json({ error: "id and channel are required" }, { status: 400 });
    }

    const sb = getSupabase();
    const { data, error } = await sb.from("subscribers").select("*").eq("id", id).maybeSingle();
    if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });

    const subscriber = data as SubscriberRecord;

    // Routed through recordConsent so a staff unsubscribe is logged exactly
    // like any other, rather than quietly flipping a column.
    const result = await recordConsent({
      email: subscriber.email,
      phone: subscriber.phone,
      channels: [{ channel, optIn: false }],
      source: "admin",
      consentText: ADMIN_UNSUBSCRIBE_CONSENT_TEXT,
    });

    if (channel === "email") await syncSubscriberToResend(result.subscriber);

    return Response.json({ subscriber: result.subscriber });
  } catch (err) {
    console.error("ADMIN_SUBSCRIBER_PATCH_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
