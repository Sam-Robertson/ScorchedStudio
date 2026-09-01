// app/api/admin/accounting/tax-export/route.ts
// Phase 7: yearly totals by account mapped to a tax line (§8 /tax-export),
// plus a transaction detail CSV and a fixed-asset register CSV for the CPA.
// Book depreciation shown here is not tax depreciation — the CPA computes
// that from the fixed-asset register export (§11 open item).
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [header, ...body].join("\n");
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
    const format = searchParams.get("format") ?? "json";

    if (format === "assets-csv") {
      const { data: assets, error } = await sb
        .from("fixed_assets")
        .select("description, cost, in_service_date, useful_life_months, status")
        .order("in_service_date");
      if (error) throw new Error(error.message);
      const csv = toCsv(assets ?? [], ["description", "cost", "in_service_date", "useful_life_months", "status"]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="fixed-assets-register.csv"`,
        },
      });
    }

    if (format === "transactions-csv") {
      const { data: lines, error } = await sb
        .from("journal_lines")
        .select("amount, memo, journal_entries!inner(entry_date, memo, template, source), accounts(code, name, type)")
        .gte("journal_entries.entry_date", `${year}-01-01`)
        .lte("journal_entries.entry_date", `${year}-12-31`);
      if (error) throw new Error(error.message);

      type Row = {
        amount: number;
        memo: string | null;
        journal_entries: { entry_date: string; memo: string | null; template: string | null; source: string } | null;
        accounts: { code: string; name: string; type: string } | null;
      };
      const rows = ((lines ?? []) as unknown as Row[])
        .filter((l) => l.journal_entries != null)
        .map((l) => ({
          date: l.journal_entries!.entry_date,
          account_code: l.accounts?.code ?? "",
          account_name: l.accounts?.name ?? "",
          account_type: l.accounts?.type ?? "",
          amount: l.amount,
          template: l.journal_entries!.template ?? "",
          source: l.journal_entries!.source,
          memo: l.memo ?? l.journal_entries!.memo ?? "",
        }));
      const csv = toCsv(rows, ["date", "account_code", "account_name", "account_type", "amount", "template", "source", "memo"]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="transaction-detail-${year}.csv"`,
        },
      });
    }

    const { data, error } = await sb.rpc("tax_export_year", { p_year: year });
    if (error) throw new Error(error.message);
    return Response.json({ year, rows: data ?? [] });
  } catch (err) {
    console.error("ACCOUNTING_TAX_EXPORT_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
