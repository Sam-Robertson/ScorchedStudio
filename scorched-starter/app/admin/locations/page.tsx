"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { Check, Trash2 } from "lucide-react";
import type { BusinessHoursRecord, BlockedDateRecord } from "@/lib/supabase";

type LocationKey = "orem" | "slc";

type LocationRow = {
  key: LocationKey;
  name: string;
  is_bookable: boolean;
  capacity: number;
  max_party_size: number;
  address: string | null;
  has_password: boolean;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const EMPTY_HOURS: BusinessHoursRecord[] = Array.from({ length: 7 }, (_, weekday) => ({
  location: "orem",
  weekday,
  is_open: false,
  open_time: "17:00",
  close_time: "22:00",
  updated_at: "",
})) as unknown as BusinessHoursRecord[];

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

export default function AdminLocationsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <LocationsDashboard token={token} />;
}

function LocationsDashboard({ token }: { token: string }) {
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [selected, setSelected] = useState<LocationKey>("orem");

  const [hours, setHours] = useState<BusinessHoursRecord[]>([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [capacityDraft, setCapacityDraft] = useState({ capacity: "", max_party_size: "" });
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [blockedDates, setBlockedDates] = useState<BlockedDateRecord[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");
  const [addingBlocked, setAddingBlocked] = useState(false);

  const loadLocations = useCallback(() => {
    setLocationsLoading(true);
    fetch("/api/admin/locations", { headers: authHeaders })
      .then((r) => r.json())
      .then((rows) => setLocations(rows ?? []))
      .finally(() => setLocationsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadHours = useCallback(() => {
    setHoursLoading(true);
    fetch(`/api/admin/hours?location=${selected}`, { headers: authHeaders })
      .then((r) => r.json())
      .then(({ hours: rows, error: err }) => {
        if (err) throw new Error(err);
        setHours(rows?.length ? rows : EMPTY_HOURS.map((h) => ({ ...h, location: selected })));
      })
      .catch((e) => setHoursError(e.message))
      .finally(() => setHoursLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selected]);

  const loadBlockedDates = useCallback(() => {
    setBlockedLoading(true);
    fetch("/api/admin/blocked-dates", { headers: authHeaders })
      .then((r) => r.json())
      .then(({ blockedDates: rows, error: err }) => {
        if (err) throw new Error(err);
        setBlockedDates(rows ?? []);
      })
      .catch((e) => setBlockedError(e.message))
      .finally(() => setBlockedLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadLocations(); }, [loadLocations]);
  useEffect(() => { loadHours(); setHoursSaved(false); }, [loadHours]);
  useEffect(() => { loadBlockedDates(); }, [loadBlockedDates]);

  const current = locations.find((l) => l.key === selected);

  useEffect(() => {
    if (current) {
      setCapacityDraft({ capacity: String(current.capacity), max_party_size: String(current.max_party_size) });
      setPasswordMessage(null);
      setNewPassword("");
    }
  }, [current]);

  function updateDay(weekday: number, patch: Partial<BusinessHoursRecord>) {
    setHours((prev) => prev.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
    setHoursSaved(false);
  }

  async function saveHours() {
    setHoursSaving(true);
    setHoursError(null);
    setHoursSaved(false);
    try {
      const res = await fetch("/api/admin/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ location: selected, hours }),
      });
      const { hours: rows, error: err } = await res.json();
      if (err) throw new Error(err);
      setHours(rows ?? []);
      setHoursSaved(true);
    } catch (e) {
      setHoursError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHoursSaving(false);
    }
  }

  async function toggleBookable() {
    if (!current) return;
    setLocationError(null);
    const res = await fetch(`/api/admin/locations/${current.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ is_bookable: !current.is_bookable }),
    });
    const data = await res.json();
    if (!res.ok) { setLocationError(data.error ?? "Failed to update"); return; }
    setLocations((prev) => prev.map((l) => (l.key === current.key ? data : l)));
  }

  async function saveCapacity() {
    if (!current) return;
    setSavingCapacity(true);
    setLocationError(null);
    try {
      const res = await fetch(`/api/admin/locations/${current.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          capacity: Number(capacityDraft.capacity) || current.capacity,
          max_party_size: Number(capacityDraft.max_party_size) || current.max_party_size,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setLocations((prev) => prev.map((l) => (l.key === current.key ? data : l)));
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSavingCapacity(false);
    }
  }

  async function setPassword() {
    if (!current || !newPassword) return;
    setSettingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch(`/api/admin/locations/${current.key}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to set password");
      setPasswordMessage("Password updated.");
      setNewPassword("");
      setLocations((prev) => prev.map((l) => (l.key === current.key ? { ...l, has_password: true } : l)));
    } catch (e) {
      setPasswordMessage(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setSettingPassword(false);
    }
  }

  async function addBlockedDate(e: React.FormEvent) {
    e.preventDefault();
    if (!newBlockedDate) return;
    setAddingBlocked(true);
    setBlockedError(null);
    try {
      const res = await fetch("/api/admin/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ date: newBlockedDate, reason: newBlockedReason }),
      });
      const { blockedDate, error: err } = await res.json();
      if (err) throw new Error(err);
      setBlockedDates((prev) => [...prev, blockedDate].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockedDate("");
      setNewBlockedReason("");
    } catch (e) {
      setBlockedError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAddingBlocked(false);
    }
  }

  async function removeBlockedDate(date: string) {
    setBlockedError(null);
    try {
      const res = await fetch(`/api/admin/blocked-dates/${date}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setBlockedDates((prev) => prev.filter((b) => b.date !== date));
    } catch (e) {
      setBlockedError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  const sortedHours = [...hours].sort((a, b) => a.weekday - b.weekday);

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto space-y-12">
      <div>
        <h1 className="h2 font-bold">Locations</h1>
        <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1`}>
          Manage each location&apos;s staff password, booking availability, capacity, and hours.
        </p>
      </div>

      {/* ── Location tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {locationsLoading ? (
          <p className={`${vulfMono.className} text-xs text-neutral-400`}>Loading…</p>
        ) : (
          locations.map((loc) => (
            <button
              key={loc.key}
              onClick={() => setSelected(loc.key)}
              className={`${vulfMono.className} rounded-xl px-4 py-2 text-xs tracking-[0.1em] font-semibold transition-colors ${
                selected === loc.key
                  ? "bg-[#884A20] text-white"
                  : "border border-black/15 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {loc.name.toUpperCase()}
              {!loc.is_bookable && <span className="ml-1.5 opacity-60">· not bookable</span>}
            </button>
          ))
        )}
      </div>

      {locationError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{locationError}</p>
      )}

      {current && (
        <>
          {/* ── Access + availability ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <p className={`${vulfMono.className} font-bold text-sm mb-1`}>Staff Password</p>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>
                {current.has_password
                  ? "This location can log in with its current password."
                  : "No password set — staff can't log in to this location yet."}
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={setPassword}
                  disabled={settingPassword || newPassword.length < 6}
                  className={`${vulfMono.className} rounded-lg bg-[#519A70] px-4 py-2 text-xs tracking-[0.1em] text-white font-semibold hover:opacity-90 disabled:opacity-40`}
                >
                  {settingPassword ? "Saving…" : "Set"}
                </button>
              </div>
              {passwordMessage && <p className="text-xs text-neutral-500 mt-2">{passwordMessage}</p>}
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <p className={`${vulfMono.className} font-bold text-sm mb-1`}>Public Booking</p>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>
                Whether this location appears as a choice on the public booking page.
              </p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={current.is_bookable}
                  onChange={toggleBookable}
                  className="w-4 h-4 accent-[#519A70]"
                />
                <span className={`${vulfMono.className} text-sm`}>
                  {current.is_bookable ? "Bookable now" : "Hidden from customers"}
                </span>
              </label>
            </div>
          </div>

          {/* ── Capacity ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <p className={`${vulfMono.className} font-bold text-sm mb-4`}>Capacity</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Studio capacity (per slot)</label>
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} w-28`}
                  value={capacityDraft.capacity}
                  onChange={(e) => setCapacityDraft((s) => ({ ...s, capacity: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Max party size</label>
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} w-28`}
                  value={capacityDraft.max_party_size}
                  onChange={(e) => setCapacityDraft((s) => ({ ...s, max_party_size: e.target.value }))}
                />
              </div>
              <button
                onClick={saveCapacity}
                disabled={savingCapacity}
                className={`${vulfMono.className} rounded-lg bg-[#519A70] px-4 py-2.5 text-xs tracking-[0.1em] text-white font-semibold hover:opacity-90 disabled:opacity-40`}
              >
                {savingCapacity ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* ── Weekly hours ─────────────────────────────────────────────── */}
          <div>
            <p className={`${vulfMono.className} font-bold text-sm mb-4`}>Weekly Schedule — {current.name}</p>

            {hoursError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{hoursError}</p>
            )}

            {hoursLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400 py-8 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                Loading hours…
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5">
                {sortedHours.map((day) => (
                  <div key={day.weekday} className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
                    <label className="flex items-center gap-2 w-28 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={day.is_open}
                        onChange={(e) => updateDay(day.weekday, { is_open: e.target.checked })}
                        className="w-4 h-4 accent-[#519A70]"
                      />
                      <span className={`${vulfMono.className} text-sm font-medium`}>
                        {DAY_LABELS[day.weekday]}
                      </span>
                    </label>
                    {day.is_open ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={day.open_time}
                          onChange={(e) => updateDay(day.weekday, { open_time: e.target.value })}
                          className={inputCls}
                        />
                        <span className="text-neutral-400 text-sm">to</span>
                        <input
                          type="time"
                          value={day.close_time}
                          onChange={(e) => updateDay(day.weekday, { close_time: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    ) : (
                      <span className={`${vulfMono.className} text-xs text-neutral-400 uppercase tracking-wider`}>
                        Closed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={saveHours}
                disabled={hoursSaving || hoursLoading}
                className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
              >
                <Check className="w-3.5 h-3.5" />
                {hoursSaving ? "SAVING…" : "SAVE HOURS"}
              </button>
              {hoursSaved && (
                <span className={`${vulfMono.className} text-xs text-[#519A70]`}>Saved.</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Blocked dates (shared across all locations) ─────────────────── */}
      <div>
        <p className={`${vulfMono.className} font-bold text-sm mb-1`}>Blocked Dates</p>
        <p className={`${vulfMono.className} text-xs text-neutral-400 mb-4`}>
          Close specific dates for holidays or private events — applies to every location.
        </p>

        {blockedError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{blockedError}</p>
        )}

        <form onSubmit={addBlockedDate} className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Date</label>
            <input
              type="date"
              required
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-neutral-500 mb-1">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Thanksgiving"
              value={newBlockedReason}
              onChange={(e) => setNewBlockedReason(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </div>
          <button
            type="submit"
            disabled={addingBlocked}
            className={`${vulfMono.className} rounded-xl bg-[#884A20] px-5 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
          >
            {addingBlocked ? "ADDING…" : "ADD"}
          </button>
        </form>

        {blockedLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-8 justify-center">
            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            Loading blocked dates…
          </div>
        ) : blockedDates.length === 0 ? (
          <p className="text-sm text-neutral-400">No blocked dates.</p>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5">
            {blockedDates.map((b) => (
              <div key={b.date} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
                <div>
                  <p className={`${vulfMono.className} text-sm font-medium`}>
                    {new Date(b.date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                  {b.reason && <p className="text-xs text-neutral-400 mt-0.5">{b.reason}</p>}
                </div>
                <button
                  onClick={() => removeBlockedDate(b.date)}
                  aria-label={`Remove blocked date ${b.date}`}
                  className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
