// app/api/admin/marketing/export/route.ts — CSV export of the subscriber list.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import type { SubscriberRecord } from "@/lib/supabase";

// Quote every field and double any embedded quotes, so a name containing a
// comma cannot shift every later column.
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("subscribers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as SubscriberRecord[];
  const header = [
    "email", "phone", "first_name", "last_name",
    "email_status", "sms_status", "tags", "last_sms_contact_at", "created_at",
  ];

  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.email, r.phone, r.first_name, r.last_name,
        r.email_status, r.sms_status, (r.tags ?? []).join(" "),
        r.last_sms_contact_at, r.created_at,
      ].map(csvCell).join(",")
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
