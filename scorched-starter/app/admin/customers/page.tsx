"use client";

// Everyone who has created a login.
//
// Worth being precise about, because the number is much smaller than "how many
// customers do we have": bookings and waivers are keyed by email and never
// required an account, so most people who have been to the studio have no row
// here. The page says so rather than leaving a short list looking like a bug.
import { useCallback, useEffect, useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Download, Loader2, Search } from "lucide-react";

type AdminCustomer = {
  id: string;
  email: string;
  createdAt: string;
  name: string | null;
  bookingCount: number;
  cancelledCount: number;
  totalPaidCents: number;
  lastBookingDate: string | null;
  membershipStatus: string | null;
  enrollmentCount: number;
  hasWaiver: boolean;
};

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";
const btnCls = `${vulfMono.className} rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.1em]`;

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shortDate(value: string | null) {
  if (!value) return "—";
  // Booking dates are plain YYYY-MM-DD; anchoring at midday keeps them from
  // rendering a day early in a negative-offset timezone.
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/customers", {
        headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load");
      setCustomers(body.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (c) =>
        c.email.toLowerCase().includes(needle) ||
        (c.name ?? "").toLowerCase().includes(needle)
    );
  }, [customers, q]);

  const totals = useMemo(
    () => ({
      accounts: customers.length,
      withBookings: customers.filter((c) => c.bookingCount > 0).length,
      spend: customers.reduce((s, c) => s + c.totalPaidCents, 0),
    }),
    [customers]
  );

  function exportCsv() {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["name", "email", "signed_up", "bookings", "cancelled", "total_paid", "last_booking", "membership", "courses", "waiver_on_file"].join(","),
      ...shown.map((c) =>
        [
          c.name,
          c.email,
          c.createdAt,
          c.bookingCount,
          c.cancelledCount,
          (c.totalPaidCents / 100).toFixed(2),
          c.lastBookingDate,
          c.membershipStatus ?? "",
          c.enrollmentCount,
          c.hasWaiver ? "yes" : "no",
        ]
          .map(cell)
          .join(",")
      ),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <h1 className={`${vulfMono.className} text-lg tracking-[0.15em] uppercase mb-2`}>
        Customer Accounts
      </h1>
      <p className="text-sm text-neutral-500 mb-6 max-w-2xl">
        People who set a password and can sign in at{" "}
        <span className="font-medium">/account</span>. Booking and signing a waiver never required
        an account, so most customers will not appear here. Their name and history are matched up
        by email address.
      </p>

      {!loading && customers.length > 0 && (
        <div className="flex flex-wrap gap-6 mb-6">
          {[
            ["Accounts", String(totals.accounts)],
            ["Have booked", String(totals.withBookings)],
            ["Lifetime spend", money(totals.spend)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className={`${vulfMono.className} text-xs text-neutral-400 uppercase tracking-[0.1em]`}>
                {label}
              </div>
              <div className="text-xl">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className={`${vulfMono.className} block text-xs text-neutral-500 mb-1.5`}>
            Search
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Name or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={exportCsv}
          disabled={shown.length === 0}
          className={`${btnCls} border border-black/20 text-neutral-600 flex items-center gap-1.5 disabled:opacity-40`}
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Nobody has created an account yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr className={`${vulfMono.className} text-xs text-neutral-500`}>
                <th className="p-3">Person</th>
                <th className="p-3">Signed up</th>
                <th className="p-3">Bookings</th>
                <th className="p-3">Spent</th>
                <th className="p-3">Last booking</th>
                <th className="p-3">Other</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-t border-black/5 align-top">
                  <td className="p-3">
                    <div>{c.name ?? <span className="text-neutral-400">Name unknown</span>}</div>
                    <div className="text-xs text-neutral-400">{c.email}</div>
                  </td>
                  <td className="p-3 text-neutral-600">{shortDate(c.createdAt)}</td>
                  <td className="p-3">
                    {c.bookingCount}
                    {c.cancelledCount > 0 && (
                      <span className="text-xs text-neutral-400"> ({c.cancelledCount} cancelled)</span>
                    )}
                  </td>
                  <td className="p-3">{money(c.totalPaidCents)}</td>
                  <td className="p-3 text-neutral-600">{shortDate(c.lastBookingDate)}</td>
                  <td className="p-3 text-xs text-neutral-500 space-y-0.5">
                    {c.membershipStatus && <div>Membership: {c.membershipStatus}</div>}
                    {c.enrollmentCount > 0 && <div>{c.enrollmentCount} course(s)</div>}
                    <div className={c.hasWaiver ? "" : "text-amber-600"}>
                      {c.hasWaiver ? "Waiver on file" : "No waiver"}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-neutral-400 text-sm">
                    No accounts match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
