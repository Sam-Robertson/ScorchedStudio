// app/api/admin/accounting/periods/route.ts — period locks
// A locked month rejects journal_entries/journal_lines writes for any date
// in that month (enforced in Postgres, see supabase-accounting-setup.sql).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("period_locks")
      .select("*")
      .order("period_month", { ascending: false });
    if (error) {
      console.error("ACCOUNTING_PERIODS_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch period locks" }, { status: 500 });
    }
    return Response.json({ periods: data });
  } catch (err) {
    console.error("ACCOUNTING_PERIODS_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const periodMonth: unknown = body.periodMonth; // any date within the month, e.g. "2026-07-01"
    const reason: unknown = body.reason;

    if (typeof periodMonth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodMonth)) {
      return Response.json({ error: "periodMonth is required (YYYY-MM-DD)" }, { status: 400 });
    }
    const firstOfMonth = periodMonth.slice(0, 7) + "-01";

    const sb = getSupabase();
    const { data, error } = await sb
      .from("period_locks")
      .upsert({ period_month: firstOfMonth, reason: typeof reason === "string" ? reason.trim() || null : null })
      .select()
      .single();
    if (error) {
      console.error("ACCOUNTING_PERIODS_POST_ERROR", error);
      return Response.json({ error: "Failed to lock period" }, { status: 500 });
    }

    await sb.from("audit_log").insert({
      actor: "admin",
      action: "lock",
      table_name: "period_locks",
      row_id: null,
      diff: { period_month: firstOfMonth, reason },
    });

    return Response.json({ period: data });
  } catch (err) {
    console.error("ACCOUNTING_PERIODS_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const periodMonth = searchParams.get("periodMonth");
    if (!periodMonth || !/^\d{4}-\d{2}-\d{2}$/.test(periodMonth)) {
      return Response.json({ error: "periodMonth query param is required (YYYY-MM-DD)" }, { status: 400 });
    }
    const firstOfMonth = periodMonth.slice(0, 7) + "-01";

    const sb = getSupabase();
    const { error } = await sb.from("period_locks").delete().eq("period_month", firstOfMonth);
    if (error) {
      console.error("ACCOUNTING_PERIODS_DELETE_ERROR", error);
      return Response.json({ error: "Failed to unlock period" }, { status: 500 });
    }

    await sb.from("audit_log").insert({
      actor: "admin",
      action: "unlock",
      table_name: "period_locks",
      row_id: null,
      diff: { period_month: firstOfMonth },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("ACCOUNTING_PERIODS_DELETE_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
