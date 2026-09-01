// app/api/admin/accounting/reconcile/route.ts
// Per bank account: live Plaid balance vs. the ledger's balance for that
// account, per §8's /reconcile page. Also reports the clearing accounts
// (Square, Stripe, Payroll) that should trend to zero.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { getAccounts, getDecryptedAccessToken } from "@/lib/plaid";

const CLEARING_CODES = ["1100", "1110", "2300"];

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();

    const { data: bankAccounts, error: baErr } = await sb
      .from("bank_accounts")
      .select("id, plaid_item_id, plaid_account_id, name, mask, kind, ledger_account_id, accounts(code,name)")
      .eq("active", true);
    if (baErr) throw new Error(baErr.message);

    // One Plaid call per item, not per account.
    const itemIds = [...new Set((bankAccounts ?? []).map((b) => b.plaid_item_id).filter((v): v is string => !!v))];
    const balancesByPlaidAccountId = new Map<string, number | null>();
    for (const itemId of itemIds) {
      try {
        const accessToken = await getDecryptedAccessToken(itemId);
        const { accounts } = await getAccounts(accessToken);
        for (const a of accounts) balancesByPlaidAccountId.set(a.account_id, a.balances.current);
      } catch (err) {
        console.error("ACCOUNTING_RECONCILE_PLAID_ERROR", itemId, err);
      }
    }

    const rows = [];
    for (const b of bankAccounts ?? []) {
      const { data: lines } = await sb.from("journal_lines").select("amount").eq("account_id", b.ledger_account_id);
      const sum = (lines ?? []).reduce((s, l) => s + Number(l.amount), 0);
      const ledgerBalance = b.kind === "credit" ? -sum : sum;
      const plaidBalance = balancesByPlaidAccountId.get(b.plaid_account_id) ?? null;
      rows.push({
        bankAccountId: b.id,
        name: b.name,
        mask: b.mask,
        kind: b.kind,
        accountCode: (b.accounts as unknown as { code: string } | null)?.code ?? null,
        accountName: (b.accounts as unknown as { name: string } | null)?.name ?? null,
        ledgerBalance,
        plaidBalance,
        difference: plaidBalance == null ? null : Math.round((plaidBalance - ledgerBalance) * 100) / 100,
      });
    }

    const clearing = [];
    for (const code of CLEARING_CODES) {
      const { data: account } = await sb.from("accounts").select("id,code,name").eq("code", code).single();
      if (!account) continue;
      const { data: lines } = await sb.from("journal_lines").select("amount").eq("account_id", account.id);
      const balance = (lines ?? []).reduce((s, l) => s + Number(l.amount), 0);
      clearing.push({ code: account.code, name: account.name, balance });
    }

    return Response.json({ bankAccounts: rows, clearing });
  } catch (err) {
    console.error("ACCOUNTING_RECONCILE_ERROR", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
