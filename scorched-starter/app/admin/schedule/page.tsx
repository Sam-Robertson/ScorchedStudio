"use client";

// app/admin/schedule/page.tsx
import { useEffect, useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { ScheduleShiftWithStaff } from "@/lib/supabase";

// ── Timezone-safe calendar helpers ─────────────────────────────────────────────
//
// Square gives real timestamptz values with the shift location's actual UTC
// offset baked in. We never bucket those by the browser's local timezone;
// everything here is computed against STUDIO_TIMEZONE explicitly, since a
// bare UTC day-of-week miscalculation elsewhere has burned this app before.

const STUDIO_TIMEZONE = "America/Denver";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Ymd = { y: number; m: number; d: number };

function ymdInTimezone(date: Date, timeZone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function dateKey({ y, m, d }: Ymd) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Weekday (0=Sun) for a calendar date. Date.UTC + getUTCDay is pure calendar
// math and is not affected by the browser's local timezone.
function weekdayOf({ y, m, d }: Ymd) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addCalendarDays({ y, m, d }: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// An ISO instant at UTC midnight of the given calendar date, offset by
// paddingDays. Used only to build a query window wide enough to contain
// every timezone's version of that date (max real-world offset is +-14h),
// never to render anything.
function paddedInstant(ymd: Ymd, paddingDays: number) {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  dt.setUTCDate(dt.getUTCDate() + paddingDays);
  return dt.toISOString();
}

function fmtDayLabel(ymd: Ymd) {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtShiftTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: STUDIO_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Shift chip ──────────────────────────────────────────────────────────────

function ShiftChip({ shift }: { shift: ScheduleShiftWithStaff }) {
  const start = fmtShiftTime(shift.start_at);
  const end = fmtShiftTime(shift.end_at);
  return (
    <div className="rounded-lg border border-black/10 bg-neutral-50 px-2.5 py-1.5">
      <p className="text-xs font-medium truncate">{shift.staff_name ?? "Unassigned"}</p>
      {shift.job_title && (
        <p className={`${vulfMono.className} text-[10px] text-neutral-500 truncate`}>{shift.job_title}</p>
      )}
      <p className={`${vulfMono.className} text-[10px] text-neutral-400 mt-0.5`}>
        {start}
        {end && ` - ${end}`}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSchedulePage() {
  const [token, setToken] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Ymd>(() => {
    const today = ymdInTimezone(new Date(), STUDIO_TIMEZONE);
    return addCalendarDays(today, -weekdayOf(today));
  });
  const [shifts, setShifts] = useState<ScheduleShiftWithStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    setToken(getAdminToken());
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)),
    [weekStart]
  );

  async function loadShifts() {
    if (!token) return;
    setLoading(true);
    const start = paddedInstant(weekStart, -1);
    const end = paddedInstant(addCalendarDays(weekStart, 7), 1);
    const res = await fetch(`/api/admin/shifts?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setShifts(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart]);

  async function handleSync() {
    if (!token) return;
    setSyncing(true);
    setSyncMessage("");
    const res = await fetch("/api/admin/shifts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const result = await res.json();
      setSyncMessage(`Synced ${result.shiftsSynced} shifts`);
      await loadShifts();
    } else {
      setSyncMessage("Sync failed");
    }
    setSyncing(false);
  }

  const locationIds = useMemo(
    () => Array.from(new Set(shifts.map((s) => s.square_location_id))),
    [shifts]
  );

  const visibleShifts = useMemo(
    () => (locationFilter === "all" ? shifts : shifts.filter((s) => s.square_location_id === locationFilter)),
    [shifts, locationFilter]
  );

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ScheduleShiftWithStaff[]>();
    for (const day of weekDays) map.set(dateKey(day), []);
    for (const shift of visibleShifts) {
      const key = dateKey(ymdInTimezone(new Date(shift.start_at), STUDIO_TIMEZONE));
      map.get(key)?.push(shift);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return map;
  }, [visibleShifts, weekDays]);

  const rangeLabel = `${fmtDayLabel(weekDays[0])} - ${fmtDayLabel(weekDays[6])}`;

  return (
    <section className="container-px py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Schedule</h1>
        </div>
        <div className="flex items-center gap-2">
          {syncMessage && (
            <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>{syncMessage}</p>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`${vulfMono.className} flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-xs tracking-wide text-neutral-600 hover:bg-black/5 disabled:opacity-60`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "SYNCING..." : "SYNC NOW"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
        {/* Week nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <button
            onClick={() => setWeekStart((w) => addCalendarDays(w, -7))}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className={`${vulfMono.className} text-sm font-bold`}>{rangeLabel}</h2>
          <button
            onClick={() => setWeekStart((w) => addCalendarDays(w, 7))}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {locationIds.length > 1 && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-black/8">
            <span className={`${vulfMono.className} text-[10px] uppercase tracking-wide text-neutral-400`}>
              Location
            </span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-lg border border-black/20 bg-white px-2 py-1 text-xs outline-none focus:border-black/40"
            >
              <option value="all">All Locations</option>
              {locationIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Day columns */}
        {loading ? (
          <div className="py-20 text-center text-sm text-neutral-400">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {weekDays.map((day, i) => {
              const key = dateKey(day);
              const dayShifts = shiftsByDay.get(key) ?? [];
              const isLastCol = i === weekDays.length - 1;
              return (
                <div
                  key={key}
                  className={`p-2 min-h-[140px] ${isLastCol ? "" : "sm:border-r border-black/5"} border-b sm:border-b-0 border-black/5`}
                >
                  <p className={`${vulfMono.className} text-[10px] uppercase tracking-wide text-neutral-400 mb-2 px-1`}>
                    {DAY_LABELS[i]} {day.m}/{day.d}
                  </p>
                  <div className="space-y-1.5">
                    {dayShifts.length === 0 ? (
                      <p className="text-[11px] text-neutral-300 px-1">No shifts</p>
                    ) : (
                      dayShifts.map((shift) => <ShiftChip key={shift.id} shift={shift} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
