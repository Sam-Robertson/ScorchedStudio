"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { formatDenverDate } from "@/lib/timezone";
import { Search, X } from "lucide-react";
import type {
  MembershipPlan,
  MembershipRecord,
  MembershipRedemptionRecord,
  MembershipStatus,
} from "@/lib/memberships";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

const STATUS_BADGE: Record<MembershipStatus, string> = {
  active: "bg-green-100 text-green-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-neutral-100 text-neutral-500",
  incomplete: "bg-neutral-100 text-neutral-500",
};

const STATUS_LABEL: Record<MembershipStatus, string> = {
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

const STAFF_NAME_KEY = "membershipStaffName";

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminMembershipsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <MembershipsDashboard token={token} />;
}

function MembershipsDashboard({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MembershipRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/admin/memberships?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, token]);

  return (
    <section className="container-px py-12 sm:py-16 max-w-3xl mx-auto">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <h1 className="h2 font-bold">Memberships</h1>
      </div>

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          className={`${inputCls} pl-10 py-3`}
          placeholder="Search by name, email, or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {searching && <p className={`${vulfMono.className} text-xs text-neutral-400`}>Searching…</p>}

      {!searching && query.trim() && results.length === 0 && (
        <p className="text-sm text-neutral-400 italic">No members found.</p>
      )}

      <div className="space-y-2">
        {results.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className="w-full text-left rounded-xl border border-black/10 bg-white px-4 py-3 hover:border-black/25 transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{m.name || m.email}</p>
              <p className="text-xs text-neutral-400 truncate">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
            </div>
            <span className={`${vulfMono.className} shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[m.status]}`}>
              {STATUS_LABEL[m.status]}
            </span>
          </button>
        ))}
      </div>

      {selectedId && (
        <MembershipDetailModal
          membershipId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

function MembershipDetailModal({
  membershipId,
  token,
  onClose,
}: {
  membershipId: string;
  token: string;
  onClose: () => void;
}) {
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [redemptions, setRedemptions] = useState<MembershipRedemptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [redeemedBy, setRedeemedBy] = useState("");
  const [squareOrderId, setSquareOrderId] = useState("");
  const [notes, setNotes] = useState("");

  const [entranceCount, setEntranceCount] = useState(1);
  const [entranceSaving, setEntranceSaving] = useState(false);

  const [creditSubtotal, setCreditSubtotal] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);

  useEffect(() => {
    setRedeemedBy(localStorage.getItem(STAFF_NAME_KEY) || "");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/memberships/${membershipId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setMembership(data.membership);
        setPlan(data.plan);
        setRedemptions(data.redemptions);
      })
      .finally(() => setLoading(false));
  }, [membershipId, token]);

  useEffect(() => { load(); }, [load]);

  async function redeem(type: "entrance" | "wood_credit", amount: number) {
    setActionError(null);
    if (!redeemedBy.trim()) {
      setActionError("Enter who's redeeming this before continuing.");
      return;
    }
    localStorage.setItem(STAFF_NAME_KEY, redeemedBy.trim());

    const res = await fetch(`/api/admin/memberships/${membershipId}/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type,
        amount,
        redeemed_by: redeemedBy.trim(),
        square_order_id: squareOrderId.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Redemption failed." }));
      setActionError(error ?? "Redemption failed.");
      return;
    }

    setSquareOrderId("");
    setNotes("");
    load();
  }

  async function handleRedeemEntrance() {
    setEntranceSaving(true);
    await redeem("entrance", entranceCount);
    setEntranceSaving(false);
    setEntranceCount(1);
  }

  async function handleApplyCredit() {
    const dollars = Number(creditAmount);
    if (!dollars || dollars <= 0) {
      setActionError("Enter a credit amount greater than $0.");
      return;
    }
    setCreditSaving(true);
    await redeem("wood_credit", Math.round(dollars * 100));
    setCreditSaving(false);
    setCreditAmount("");
    setCreditSubtotal("");
  }

  // Credit covers the subtotal at face value first — the discount only kicks
  // in on whatever's left once credit runs out, not the other way around.
  const subtotalCents = Math.round((Number(creditSubtotal) || 0) * 100);
  const discountPct = plan?.wood_discount_pct ?? 0;
  const suggestedCreditCents = membership
    ? Math.min(membership.wood_credit_remaining_cents, subtotalCents)
    : 0;
  const remainderAfterCreditCents = subtotalCents - suggestedCreditCents;
  const amountDueCents = Math.round(remainderAfterCreditCents * (1 - discountPct / 100));

  const inactive = membership?.status !== "active";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-black/10 shrink-0">
          {membership && (
            <div>
              <h2 className="text-base font-semibold text-neutral-900">{membership.name || membership.email}</h2>
              <p className="text-xs text-neutral-400 mt-0.5">{membership.email}{membership.phone ? ` · ${membership.phone}` : ""}</p>
            </div>
          )}
          <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading || !membership || !plan ? (
            <p className={`${vulfMono.className} text-xs text-neutral-400`}>Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[membership.status]}`}>
                  {STATUS_LABEL[membership.status]}
                </span>
                <span className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#F6E4E1] text-[#884A20]`}>
                  {plan.name} · {membership.billing_interval}
                </span>
                {membership.current_period_end && (
                  <span className="text-xs text-neutral-400">
                    Renews {formatDenverDate(membership.current_period_end)}
                  </span>
                )}
              </div>

              {inactive && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
                  This membership isn&apos;t active — redemptions are blocked.
                </p>
              )}

              {actionError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{actionError}</p>
              )}

              <div className="rounded-xl border border-black/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>ENTRANCES</p>
                  <p className="text-sm font-semibold text-neutral-900">{membership.entrances_remaining} remaining</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={membership.entrances_remaining || undefined}
                    className={`${inputCls} w-20`}
                    value={entranceCount}
                    onChange={(e) => setEntranceCount(Math.max(1, Number(e.target.value)))}
                    disabled={inactive}
                  />
                  <button
                    onClick={handleRedeemEntrance}
                    disabled={inactive || entranceSaving || membership.entrances_remaining < entranceCount}
                    className={`${vulfMono.className} rounded-lg bg-[#519A70] px-4 py-2 text-xs tracking-[0.1em] text-white font-semibold hover:opacity-90 disabled:opacity-40`}
                  >
                    {entranceSaving ? "Redeeming…" : "Redeem"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-black/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>WOOD CREDIT</p>
                  <p className="text-sm font-semibold text-neutral-900">{fmtCents(membership.wood_credit_remaining_cents)} remaining</p>
                </div>
                {discountPct > 0 && (
                  <p className="text-xs text-neutral-500 mb-3">
                    {plan.name} members get {discountPct}% off wood & projects once their credit runs out —
                    draw wood credit against the subtotal at full price first, then apply the discount to
                    whatever&apos;s left.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Subtotal (optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className={inputCls}
                      placeholder="0.00"
                      value={creditSubtotal}
                      onChange={(e) => setCreditSubtotal(e.target.value)}
                      disabled={inactive}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">Credit to apply ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className={inputCls}
                      placeholder="0.00"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      disabled={inactive}
                    />
                  </div>
                </div>
                {subtotalCents > 0 && (
                  <p className="text-xs text-neutral-500 mb-2">
                    Suggested credit:{" "}
                    <button
                      type="button"
                      onClick={() => setCreditAmount((suggestedCreditCents / 100).toFixed(2))}
                      className="underline underline-offset-2 hover:text-neutral-800"
                    >
                      {fmtCents(suggestedCreditCents)}
                    </button>
                    {remainderAfterCreditCents > 0 && discountPct > 0 && (
                      <> — remaining {fmtCents(remainderAfterCreditCents)} at {discountPct}% off — amount due: {fmtCents(amountDueCents)}</>
                    )}
                    {remainderAfterCreditCents > 0 && discountPct === 0 && (
                      <> — remaining amount due: {fmtCents(remainderAfterCreditCents)}</>
                    )}
                  </p>
                )}
                <button
                  onClick={handleApplyCredit}
                  disabled={inactive || creditSaving}
                  className={`${vulfMono.className} rounded-lg bg-[#519A70] px-4 py-2 text-xs tracking-[0.1em] text-white font-semibold hover:opacity-90 disabled:opacity-40`}
                >
                  {creditSaving ? "Applying…" : "Apply credit"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-neutral-500 mb-1">Redeemed by</label>
                  <input className={inputCls} value={redeemedBy} onChange={(e) => setRedeemedBy(e.target.value)} placeholder="Staff name" disabled={inactive} />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-500 mb-1">Square order ID (optional)</label>
                  <input className={inputCls} value={squareOrderId} onChange={(e) => setSquareOrderId(e.target.value)} disabled={inactive} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">Notes (optional)</label>
                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={inactive} />
              </div>

              {redemptions.length > 0 && (
                <div>
                  <p className={`${vulfMono.className} text-[10px] text-neutral-400 mb-2`}>RECENT REDEMPTIONS</p>
                  <div className="space-y-2">
                    {redemptions.map((r) => (
                      <div key={r.id} className="rounded-lg bg-neutral-50 border border-black/8 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-neutral-700">
                            {r.type === "entrance" ? `${r.amount} entrance${r.amount === 1 ? "" : "s"}` : fmtCents(r.amount)}
                          </span>
                          <span className="text-neutral-400">{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-neutral-500 mt-0.5">
                          by {r.redeemed_by}
                          {r.square_order_id ? ` · Square ${r.square_order_id}` : ""}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
