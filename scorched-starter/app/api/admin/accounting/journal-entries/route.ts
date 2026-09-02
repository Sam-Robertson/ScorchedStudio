// app/api/admin/accounting/journal-entries/route.ts — general ledger
//
// GET lists entries (with their lines and account codes) for the ledger
// browser. POST creates a manual journal entry: arbitrary Dr/Cr lines that
// must balance, posted atomically via the post_journal_entry() Postgres
// function (see supabase-accounting-setup.sql) so the deferred balance
// trigger and the period-lock trigger see the whole entry in one statement.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const MAX_LINES = 50;

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);
    // Optional filter: only entries containing at least one line against one
    // of these account codes (comma-separated). Used by the reporting
    // drill-downs (Monthly P&L cells, Costs "View charges").
    const accountCodes = (searchParams.get("accountCode") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const sb = getSupabase();
    let query = sb
      .from("journal_entries")
      .select("*, locations(key,name), journal_lines(*, accounts(code,name,type))")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      // When filtering by account, over-fetch and filter in JS (the nested
      // account code isn't a top-level column), then trim to the requested
      // limit afterwards so the caller still gets up to `limit` matches.
      .limit(accountCodes.length > 0 ? 2000 : limit);

    if (from) query = query.gte("entry_date", from);
    if (to) query = query.lte("entry_date", to);

    const { data, error } = await query;
    if (error) {
      console.error("ACCOUNTING_JOURNAL_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch journal entries" }, { status: 500 });
    }

    let entries = data ?? [];
    if (accountCodes.length > 0) {
      const codeSet = new Set(accountCodes);
      type EntryWithLines = { journal_lines?: { accounts?: { code?: string } | null }[] };
      entries = entries
        .filter((e: EntryWithLines) => (e.journal_lines ?? []).some((l) => l.accounts?.code && codeSet.has(l.accounts.code)))
        .slice(0, limit);
    }
    return Response.json({ entries });
  } catch (err) {
    console.error("ACCOUNTING_JOURNAL_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

type LineInput = { accountCode?: unknown; amount?: unknown; memo?: unknown };

export async function POST(req: NextRequest) {
  // requireAdmin only accepts role: "admin" — accounting is not a
  // location-tier surface, unlike the 4 In Studio routes.
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const entryDate: unknown = body.entryDate;
    const memo: unknown = body.memo;
    const location: unknown = body.location; // 'orem' | 'slc' | null
    const rawLines: unknown = body.lines;

    if (typeof entryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      return Response.json({ error: "entryDate is required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!Array.isArray(rawLines) || rawLines.length < 2) {
      return Response.json({ error: "At least two journal lines are required" }, { status: 400 });
    }
    if (rawLines.length > MAX_LINES) {
      return Response.json({ error: `A single entry may have at most ${MAX_LINES} lines` }, { status: 400 });
    }

    const lines: { account_code: string; amount: number; memo: string | null }[] = [];
    let sumCents = 0;
    for (const raw of rawLines as LineInput[]) {
      const accountCode = raw.accountCode;
      const amount = raw.amount;
      if (typeof accountCode !== "string" || !accountCode.trim()) {
        return Response.json({ error: "Every line needs an account code" }, { status: 400 });
      }
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
        return Response.json({ error: "Every line needs a nonzero numeric amount" }, { status: 400 });
      }
      const cents = Math.round(amount * 100);
      sumCents += cents;
      lines.push({
        account_code: accountCode.trim(),
        amount: cents / 100,
        memo: typeof raw.memo === "string" && raw.memo.trim() ? raw.memo.trim() : null,
      });
    }
    if (sumCents !== 0) {
      return Response.json({ error: `Lines must sum to zero (got ${(sumCents / 100).toFixed(2)})` }, { status: 400 });
    }

    const sb = getSupabase();

    let locationId: string | null = null;
    if (location === "orem" || location === "slc") {
      const { data: loc, error: locErr } = await sb.from("locations").select("id").eq("key", location).single();
      if (locErr || !loc) return Response.json({ error: "Unknown location" }, { status: 400 });
      locationId = loc.id;
    } else if (location != null) {
      return Response.json({ error: "location must be 'orem', 'slc', or omitted" }, { status: 400 });
    }

    const { data: entryId, error } = await sb.rpc("post_journal_entry", {
      p_entry_date: entryDate,
      p_memo: typeof memo === "string" && memo.trim() ? memo.trim() : null,
      p_source: "manual",
      p_source_id: null,
      p_template: null,
      p_location_id: locationId,
      p_created_by: "admin",
      p_lines: lines,
    });

    if (error) {
      console.error("ACCOUNTING_JOURNAL_POST_ERROR", error);
      const status = /locked|Unknown account code/.test(error.message) ? 400 : 500;
      return Response.json({ error: error.message }, { status });
    }

    await sb.from("audit_log").insert({
      actor: "admin",
      action: "create",
      table_name: "journal_entries",
      row_id: entryId,
      diff: { entryDate, memo, location, lines },
    });

    return Response.json({ id: entryId });
  } catch (err) {
    console.error("ACCOUNTING_JOURNAL_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
