"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Check, Info, Lock, Plus, Trash2, Unlock, X } from "lucide-react";
import type { Account } from "./types";
import BankAccountsTab from "./BankAccountsTab";
import InboxTab from "./InboxTab";
import RulesTab from "./RulesTab";
import ReconcileTab from "./ReconcileTab";
import TaxExportTab from "./TaxExportTab";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

type JournalLine = {
  id: string;
  amount: number;
  memo: string | null;
  accounts: { code: string; name: string; type: string } | null;
};

type JournalEntry = {
  id: string;
  entry_date: string;
  memo: string | null;
  source: string;
  template: string | null;
  locked: boolean;
  created_at: string;
  locations: { key: string; name: string } | null;
  journal_lines: JournalLine[];
};

type PeriodLock = { period_month: string; locked_at: string; reason: string | null };

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function AdminAccountingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <AccountingDashboard token={token} />;
}

type Tab = "journal" | "accounts" | "periods" | "bank-accounts" | "inbox" | "rules" | "reconcile" | "tax-export";

const TAB_LABEL: Record<Tab, string> = {
  journal: "Journal",
  accounts: "Chart of Accounts",
  periods: "Periods",
  "bank-accounts": "Bank Accounts",
  inbox: "Inbox",
  rules: "Rules",
  reconcile: "Reconcile",
  "tax-export": "Tax Export",
};

function AccountingDashboard({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("journal");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const loadAccounts = useCallback(() => {
    fetch("/api/admin/accounting/accounts", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ accounts: list }) => setAccounts(list ?? []))
      .finally(() => setAccountsLoaded(true));
  }, [token]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <section className="container-px py-12 sm:py-16 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="h2 font-bold">Accounting</h1>
        <p className="text-sm text-neutral-500 mt-1">General ledger, chart of accounts, and period locks.</p>
      </div>

      <div className={`${vulfMono.className} flex gap-1 mb-8 border-b border-black/10 overflow-x-auto`}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs tracking-[0.15em] uppercase font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t ? "border-[#884A20] text-[#884A20]" : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "journal" && <JournalTab token={token} accounts={accounts} />}
      {tab === "accounts" && <AccountsTab accounts={accounts} loaded={accountsLoaded} />}
      {tab === "periods" && <PeriodsTab token={token} />}
      {tab === "bank-accounts" && <BankAccountsTab token={token} accounts={accounts} />}
      {tab === "inbox" && <InboxTab token={token} accounts={accounts} />}
      {tab === "rules" && <RulesTab token={token} accounts={accounts} />}
      {tab === "reconcile" && <ReconcileTab token={token} />}
      {tab === "tax-export" && <TaxExportTab token={token} />}
    </section>
  );
}

// ── Journal ──────────────────────────────────────────────────────────────────

type LineDraft = { accountCode: string; amount: string; memo: string };

function emptyLine(): LineDraft {
  return { accountCode: "", amount: "", memo: "" };
}

function JournalTab({ token, accounts }: { token: string; accounts: Account[] }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [location, setLocation] = useState<"" | "orem" | "slc">("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/journal-entries?limit=100", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ entries: list, error: err }) => {
        if (err) throw new Error(err);
        setEntries(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const balanceCents = lines.reduce((s, l) => {
    const n = parseFloat(l.amount);
    return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function resetForm() {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setLocation("");
    setLines([emptyLine(), emptyLine()]);
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (balanceCents !== 0) {
      setError(`Lines must sum to zero (currently ${fmtMoney(balanceCents / 100)})`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accounting/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entryDate,
          memo: memo || null,
          location: location || null,
          lines: lines
            .filter((l) => l.accountCode && l.amount)
            .map((l) => ({ accountCode: l.accountCode, amount: parseFloat(l.amount), memo: l.memo || undefined })),
        }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      resetForm();
      setShowNew(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-neutral-500">Manual entries and everything posted by rules/jobs, most recent first.</p>
        <button
          onClick={() => { setShowNew((v) => !v); setError(null); }}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
        >
          <Plus className="w-3.5 h-3.5" />
          NEW ENTRY
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}

      {showNew && (
        <form onSubmit={submitEntry} className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Date</label>
              <input type="date" className={inputCls} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Location (optional)</label>
              <select className={inputCls} value={location} onChange={(e) => setLocation(e.target.value as typeof location)}>
                <option value="">—</option>
                <option value="orem">Orem</option>
                <option value="slc">Salt Lake City</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Memo</label>
              <input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-neutral-500">Lines (debit positive, credit negative)</label>
              <span className={`${vulfMono.className} text-xs ${balanceCents === 0 ? "text-[#519A70]" : "text-red-600"}`}>
                Balance: {fmtMoney(balanceCents / 100)}
              </span>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    className={inputCls}
                    value={l.accountCode}
                    onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                  >
                    <option value="">Account…</option>
                    {accounts.filter((a) => a.active).map((a) => (
                      <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <input
                    className={`${inputCls} max-w-[140px]`}
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={l.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder="Line memo (optional)"
                    value={l.memo}
                    onChange={(e) => updateLine(i, { memo: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length <= 2}
                    className="p-2 text-neutral-400 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className={`${vulfMono.className} mt-2 text-xs text-[#884A20] hover:underline`}
            >
              + add line
            </button>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? "POSTING…" : "POST ENTRY"}
            </button>
            <button
              type="button"
              onClick={() => { setShowNew(false); setError(null); }}
              className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-5 py-2.5 text-xs tracking-[0.15em] text-neutral-600 font-semibold hover:bg-neutral-50`}
            >
              <X className="w-3.5 h-3.5" />
              CANCEL
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading journal…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-neutral-400 py-12 text-center">No journal entries yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`${vulfMono.className} text-sm font-bold`}>{entry.entry_date}</p>
                  {entry.locations && (
                    <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500`}>
                      {entry.locations.name}
                    </span>
                  )}
                  <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#884A20]/10 text-[#884A20]`}>
                    {entry.template ?? entry.source}
                  </span>
                  {entry.locked && <Lock className="w-3.5 h-3.5 text-neutral-400" />}
                </div>
              </div>
              {entry.memo && <p className="text-xs text-neutral-500 mb-2">{entry.memo}</p>}
              <div className="text-xs divide-y divide-black/5">
                {entry.journal_lines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-1.5">
                    <span className="text-neutral-600">
                      {l.accounts ? `${l.accounts.code} — ${l.accounts.name}` : "Unknown account"}
                      {l.memo ? <span className="text-neutral-400"> · {l.memo}</span> : null}
                    </span>
                    <span className={`${vulfMono.className} ${l.amount >= 0 ? "text-neutral-800" : "text-neutral-500"}`}>
                      {l.amount >= 0 ? `Dr ${fmtMoney(l.amount)}` : `Cr ${fmtMoney(-l.amount)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chart of accounts ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<Account["type"], string> = {
  asset: "Asset", liability: "Liability", equity: "Equity",
  revenue: "Revenue", cogs: "COGS", expense: "Expense",
};

// Reference text only — not editable from the UI, not stored in the DB.
// Update here when an account's real-world meaning changes or a new one
// is added; this chart doesn't change often enough to need its own table.
const ACCOUNT_DESCRIPTIONS: Record<string, string> = {
  "1000": "Main operating bank account (Chase). Revenue lands here after Square/Stripe payouts clear; most expenses and card payments go out from here.",
  "1100": "Holding account for Square revenue between when a sale is recorded and when Square actually pays it out to checking, usually a few days later. Should trend toward zero — a large or growing balance means payouts aren't clearing as expected.",
  "1110": "Same idea as Square Clearing, but for Stripe (membership and booking payments).",
  "1200": "Refundable deposits paid out (e.g. a landlord security deposit for a new location). This is money owed back to you, not an expense — it doesn't hit the P&L.",
  "1500": "Cost basis of equipment, vehicles, and fixtures the business owns and depreciates over time (the truck, Bluetti power stations, etc.). Paired with Accumulated Depreciation to show current book value.",
  "1510": "Running total of depreciation taken against Fixed Assets so far. Always a credit balance (contra-asset) — Fixed Assets minus this equals what the assets are worth on the books today.",
  "2000": "Chase Ink business credit card balance.",
  "2010": "Amex Blue Business Plus card balance.",
  "2020": "Amex Blue Business Cash card balance.",
  "2030": "U.S. Bank card (···1370) balance.",
  "2040": "U.S. Bank card (···1386) balance.",
  "2100": "Sales tax collected from customers that's owed to the state until it's actually remitted. A growing balance is normal between filing periods.",
  "2200": "Gift card balances sold but not yet redeemed — money already received that hasn't been earned yet. Moves to revenue when the card is used.",
  "2300": "Should always read $0. Square Payroll's API isn't accessible with the current credentials, so wages and employer taxes post directly to 6000/6010 instead of clearing through here.",
  "2500": "Remaining principal owed on the LiftFund business loan.",
  "2510": "Square Capital merchant cash advance balance — not yet registered in the system (no terms on file).",
  "2520": "Placeholder for an SBA loan, if one is taken out.",
  "3000": "Money the owner has personally put into the business.",
  "3010": "Money the owner has taken out of the business.",
  "3900": "Accumulated profit or loss carried forward from prior years. Maintained automatically by the system, not posted to directly.",
  "4000": "Revenue from woodburning studio sessions.",
  "4100": "Revenue from memberships.",
  "4200": "Revenue from courses.",
  "4300": "Revenue from group events and private bookings.",
  "4400": "Revenue from retail and product sales.",
  "5000": "Materials directly consumed in what's sold — wood, leather, blanks, and similar. Cost of goods sold, not general supplies.",
  "6000": "Employee wages.",
  "6010": "Employer-side payroll taxes (the business's share, not what's withheld from employees).",
  "6020": "Payments to 1099 contractors.",
  "6100": "Studio lease payments.",
  "6200": "Advertising and promotion.",
  "6300": "Square/Stripe transaction processing fees.",
  "6400": "Power, water, internet, and similar utility bills.",
  "6500": "General studio and office supplies — the catch-all for small hardware-store and miscellaneous purchases that aren't a specific category below.",
  "6600": "Software subscriptions (Gusto fees, Webflow, Asana, and similar).",
  "6700": "Business insurance premiums.",
  "6800": "Legal, accounting, and consulting fees.",
  "6850": "Business meals. Kept separate from Bank Fees & Misc because meals are only 50% tax-deductible (Schedule C Line 24b) — lumping them in would hide that from your CPA at tax time.",
  "6900": "Bank fees, overdraft charges, and small purchases that don't fit any other category.",
  "6950": "Fuel and other vehicle-related expenses.",
  "7000": "Monthly depreciation expense on Fixed Assets — the flip side of Accumulated Depreciation.",
  "8000": "Interest paid on loans and credit card balances.",
};

function AccountsTab({ accounts, loaded }: { accounts: Account[]; loaded: boolean }) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
        Loading chart of accounts…
      </div>
    );
  }
  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});
  return (
    <div className="space-y-8">
      {(Object.keys(TYPE_LABEL) as Account["type"][]).map((type) =>
        grouped[type]?.length ? (
          <div key={type}>
            <p className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-2`}>{TYPE_LABEL[type]}</p>
            <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
              {grouped[type].map((a) => (
                <div key={a.id}>
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className={`${vulfMono.className} text-neutral-400 w-14 flex-shrink-0`}>{a.code}</span>
                    <span className="flex-1">{a.name}</span>
                    {ACCOUNT_DESCRIPTIONS[a.code] && (
                      <button
                        onClick={() => setExpandedCode((prev) => (prev === a.code ? null : a.code))}
                        aria-label={`What is ${a.name}?`}
                        className={`p-1 rounded-full transition-colors ${expandedCode === a.code ? "text-[#884A20] bg-[#884A20]/10" : "text-neutral-300 hover:text-neutral-500 hover:bg-black/5"}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!a.active && (
                      <span className={`${vulfMono.className} text-[10px] tracking-widest uppercase text-neutral-400 ml-2`}>Inactive</span>
                    )}
                  </div>
                  {expandedCode === a.code && ACCOUNT_DESCRIPTIONS[a.code] && (
                    <p className="px-4 pb-3 -mt-1 text-xs text-neutral-500 leading-relaxed">{ACCOUNT_DESCRIPTIONS[a.code]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

// ── Periods ──────────────────────────────────────────────────────────────────

function PeriodsTab({ token }: { token: string }) {
  const [periods, setPeriods] = useState<PeriodLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/accounting/periods", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ periods: list, error: err }) => {
        if (err) throw new Error(err);
        setPeriods(list ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function lockPeriod(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ periodMonth: `${month}-01`, reason: reason || null }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      setReason("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lock failed");
    } finally {
      setSaving(false);
    }
  }

  async function unlockPeriod(periodMonth: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/accounting/periods?periodMonth=${periodMonth}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
    }
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-6">
        A locked month rejects any new or edited journal entry dated within it — e.g. once a period has been submitted to a lender.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>}

      <form onSubmit={lockPeriod} className="rounded-2xl border border-[#884A20]/30 bg-[#F6E4E1]/40 p-5 sm:p-6 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Month</label>
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} required />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-neutral-500 mb-1">Reason (optional)</label>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. submitted to Newtek 2026-09-01" />
        </div>
        <button
          type="submit"
          disabled={saving}
          className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
        >
          <Lock className="w-3.5 h-3.5" />
          LOCK
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading periods…
        </div>
      ) : periods.length === 0 ? (
        <p className="text-sm text-neutral-400 py-12 text-center">No locked periods.</p>
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden">
          {periods.map((p) => (
            <div key={p.period_month} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className={`${vulfMono.className} font-semibold`}>{p.period_month.slice(0, 7)}</p>
                {p.reason && <p className="text-xs text-neutral-500">{p.reason}</p>}
              </div>
              <button
                onClick={() => unlockPeriod(p.period_month)}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50`}
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
