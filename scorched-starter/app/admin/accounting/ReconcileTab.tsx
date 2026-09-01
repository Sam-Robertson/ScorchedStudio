"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type BankRow = {
  bankAccountId: string;
  name: string | null;
  mask: string | null;
  accountCode: string | null;
  accountName: string | null;
  ledgerBalance: number;
  plaidBalance: number | null;
  difference: number | null;
};

type ClearingRow = { code: string; name: string; balance: number };

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ReconcileTab({ token }: { token: string }) {
  const [bankRows, setBankRows] = useState<BankRow[]>([]);
  const [clearing, setClearing] = useState<ClearingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/reconcile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ bankAccounts, clearing: c, error: err }) => {
        if (err) throw new Error(err);
        setBankRows(bankAccounts ?? []);
        setClearing(c ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
        Loading reconciliation…
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Bank accounts</p>
        {bankRows.length === 0 ? (
          <p className="text-sm text-neutral-400 py-6 text-center">No accounts linked yet.</p>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
            {bankRows.map((r) => {
              const ok = r.difference == null || Math.abs(r.difference) < 0.01;
              return (
                <div key={r.bankAccountId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className={`${vulfMono.className} font-semibold`}>{r.name} {r.mask ? `···${r.mask}` : ""}</p>
                    <p className="text-xs text-neutral-500">{r.accountCode} — {r.accountName}</p>
                  </div>
                  <div className="text-right">
                    <p className={`${vulfMono.className} text-xs text-neutral-500`}>Ledger {fmtMoney(r.ledgerBalance)}</p>
                    <p className={`${vulfMono.className} text-xs text-neutral-500`}>Plaid {r.plaidBalance == null ? "—" : fmtMoney(r.plaidBalance)}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 ${vulfMono.className} text-xs ${ok ? "text-[#519A70]" : "text-red-600"}`}>
                    {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {r.difference == null ? "N/A" : fmtMoney(r.difference)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>Clearing accounts (should trend to zero)</p>
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
          {clearing.map((c) => {
            const ok = Math.abs(c.balance) < 100; // small residual is normal; a large one is the signal
            return (
              <div key={c.code} className="flex items-center justify-between px-4 py-3 text-sm">
                <p>{c.code} — {c.name}</p>
                <span className={`${vulfMono.className} flex items-center gap-1.5 text-xs ${ok ? "text-neutral-500" : "text-red-600"}`}>
                  {!ok && <AlertTriangle className="w-3.5 h-3.5" />}
                  {fmtMoney(c.balance)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
