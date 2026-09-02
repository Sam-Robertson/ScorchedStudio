"use client";

import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// Dismissed state for the expected-residual note, remembered per device
// (same localStorage approach as lib/adminAuth.ts).
const RESIDUAL_NOTE_KEY = "reconcile-residual-note-dismissed";

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
  // Starts hidden so users who already dismissed it never see a flash;
  // shown from the effect below if it hasn't been dismissed on this device.
  const [noteDismissed, setNoteDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(RESIDUAL_NOTE_KEY) !== "1") setNoteDismissed(false);
  }, []);

  function dismissNote() {
    setNoteDismissed(true);
    localStorage.setItem(RESIDUAL_NOTE_KEY, "1");
  }

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
      {!noteDismissed && (
        <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-500 flex-1">
            Small differences here are expected and not a bug — these bank connections are test-scoped,
            so each one&apos;s live balance doesn&apos;t necessarily match the ledger to the cent.
            A large or growing gap is still worth investigating.
          </p>
          <button onClick={dismissNote} aria-label="Dismiss note" className="text-neutral-400 hover:text-neutral-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
