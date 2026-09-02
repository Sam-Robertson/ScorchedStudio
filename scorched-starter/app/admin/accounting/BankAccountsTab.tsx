"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { vulfMono } from "@/app/fonts";
import { Link2, RefreshCw } from "lucide-react";
import type { Account } from "./types";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

type DiscoveredAccount = { plaidAccountId: string; name: string; mask: string | null; type: string; subtype: string | null };

type BankAccount = {
  id: string;
  name: string | null;
  mask: string | null;
  kind: string | null;
  active: boolean;
  accounts: { code: string; name: string } | null;
  plaid_items: { institution_name: string; last_synced_at: string | null; status: string } | null;
  locations: { key: string; name: string } | null;
};

export default function BankAccountsTab({ token, accounts }: { token: string; accounts: Account[] }) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const [pending, setPending] = useState<{ plaidItemId: string; institutionName: string; accounts: DiscoveredAccount[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, { ledgerAccountCode: string; defaultLocation: "" | "orem" | "slc" }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/bank-accounts", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ bankAccounts: list, error: err }) => {
        if (err) throw new Error(err);
        setBankAccounts(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      setError(null);
      try {
        const res = await fetch("/api/admin/accounting/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ publicToken, institutionName: metadata.institution?.name ?? "Unknown institution" }),
        });
        const body = await res.json();
        if (body.error) throw new Error(body.error);
        setPending({ plaidItemId: body.plaidItemId, institutionName: body.institutionName, accounts: body.accounts });
        setMapping(Object.fromEntries(body.accounts.map((a: DiscoveredAccount) => [a.plaidAccountId, { ledgerAccountCode: "", defaultLocation: "" }])));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to link account");
      } finally {
        setLinkToken(null);
      }
    },
  });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  async function startLink() {
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/plaid/link-token", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      setLinkToken(body.linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Plaid Link");
    }
  }

  async function confirmMapping() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      for (const a of pending.accounts) {
        const m = mapping[a.plaidAccountId];
        if (!m?.ledgerAccountCode) continue; // skip accounts the admin chose not to link
        const res = await fetch("/api/admin/accounting/bank-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            plaidItemId: pending.plaidItemId,
            plaidAccountId: a.plaidAccountId,
            name: a.name,
            mask: a.mask,
            kind: a.type,
            ledgerAccountCode: m.ledgerAccountCode,
            defaultLocation: m.defaultLocation || null,
          }),
        });
        const body = await res.json();
        if (body.error) throw new Error(`${a.name}: ${body.error}`);
      }
      setPending(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  }

  const mappableAccounts = accounts.filter((a) => a.active && (a.type === "asset" || a.type === "liability"));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-neutral-500">Chase Checking, Chase Ink, both Amex cards, and both U.S. Bank cards, synced daily via Plaid.</p>
        <button
          onClick={startLink}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
        >
          <Link2 className="w-3.5 h-3.5" />
          LINK A BANK ACCOUNT
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}

      {pending && (
        <div className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6">
          <p className={`${vulfMono.className} font-bold text-sm mb-1`}>{pending.institutionName}</p>
          <p className="text-xs text-neutral-500 mb-4">Map each account Plaid found to a ledger account before it starts syncing.</p>
          <div className="space-y-3">
            {pending.accounts.map((a) => (
              <div key={a.plaidAccountId} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white p-3">
                <div className="flex-1 min-w-[160px]">
                  <p className={`${vulfMono.className} text-sm font-semibold`}>{a.name}</p>
                  <p className="text-xs text-neutral-400">{a.type} {a.mask ? `···${a.mask}` : ""}</p>
                </div>
                <select
                  className={`${inputCls} max-w-[240px]`}
                  value={mapping[a.plaidAccountId]?.ledgerAccountCode ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [a.plaidAccountId]: { ...m[a.plaidAccountId], ledgerAccountCode: e.target.value } }))}
                >
                  <option value="">Don&apos;t link this account</option>
                  {mappableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.code}>{acc.code} — {acc.name}</option>
                  ))}
                </select>
                <select
                  className={`${inputCls} max-w-[160px]`}
                  value={mapping[a.plaidAccountId]?.defaultLocation ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [a.plaidAccountId]: { ...m[a.plaidAccountId], defaultLocation: e.target.value as "" | "orem" | "slc" } }))}
                >
                  <option value="">No default location</option>
                  <option value="orem">Orem</option>
                  <option value="slc">Salt Lake City</option>
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={confirmMapping}
              disabled={saving}
              className={`${vulfMono.className} rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
            >
              {saving ? "SAVING…" : "SAVE MAPPING"}
            </button>
            <button
              onClick={() => setPending(null)}
              className={`${vulfMono.className} rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading bank accounts…
        </div>
      ) : bankAccounts.length === 0 ? (
        <p className="text-sm text-neutral-400 py-12 text-center">No accounts linked yet.</p>
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
          {bankAccounts.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className={`${vulfMono.className} font-semibold`}>
                  {b.name} {b.mask ? <span className="text-neutral-400">···{b.mask}</span> : null}
                </p>
                <p className="text-xs text-neutral-500">
                  {b.plaid_items?.institution_name} → {b.accounts?.code} — {b.accounts?.name}
                  {b.locations ? ` · ${b.locations.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <RefreshCw className="w-3.5 h-3.5" />
                {b.plaid_items?.last_synced_at ? new Date(b.plaid_items.last_synced_at).toLocaleString() : "Not synced yet"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
