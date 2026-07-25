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
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Ymd = { y: number; m: number; d: number };
type ViewMode = "week" | "month";

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

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonths(y: number, m: number, n: number) {
  const total = m - 1 + n;
  const y2 = y + Math.floor(total / 12);
  const m2 = ((total % 12) + 12) % 12 + 1;
  return { y: y2, m: m2 };
}

function currentWeekStart(): Ymd {
  const today = ymdInTimezone(new Date(), STUDIO_TIMEZONE);
  return addCalendarDays(today, -weekdayOf(today));
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

// ── View toggle ─────────────────────────────────────────────────────────────

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex rounded-lg border border-black/15 overflow-hidden">
      {(["week", "month"] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`${vulfMono.className} px-3 py-1.5 text-xs capitalize transition-colors ${
            value === v ? "bg-[#884A20] text-white" : "text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Shift chips ───────────────────────────────────────────────────────────────

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

function MonthShiftLine({ shift }: { shift: ScheduleShiftWithStaff }) {
  const start = fmtShiftTime(shift.start_at);
  const label = `${shift.staff_name ?? "Unassigned"}${shift.job_title ? `, ${shift.job_title}` : ""}`;
  return (
    <p className="text-[10px] truncate leading-snug" title={label}>
      <span className={`${vulfMono.className} text-neutral-400 mr-1`}>{start}</span>
      {shift.staff_name ?? "Unassigned"}
    </p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSchedulePage() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState<Ymd>(currentWeekStart);
  const [monthCursor, setMonthCursor] = useState(() => {
    const today = ymdInTimezone(new Date(), STUDIO_TIMEZONE);
    return { y: today.y, m: today.m };
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

  const monthGrid = useMemo(() => {
    const total = daysInMonth(monthCursor.y, monthCursor.m);
    const firstWeekday = weekdayOf({ y: monthCursor.y, m: monthCursor.m, d: 1 });
    const totalCells = Math.ceil((firstWeekday + total) / 7) * 7;
    return Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - firstWeekday + 1;
      return dayNum >= 1 && dayNum <= total ? { y: monthCursor.y, m: monthCursor.m, d: dayNum } : null;
    });
  }, [monthCursor]);

  const visibleDays = useMemo(
    () => (view === "week" ? weekDays : monthGrid.filter((d): d is Ymd => d !== null)),
    [view, weekDays, monthGrid]
  );

  async function loadShifts() {
    if (!token) return;
    setLoading(true);

    let start: string;
    let end: string;
    if (view === "week") {
      start = paddedInstant(weekStart, -1);
      end = paddedInstant(addCalendarDays(weekStart, 7), 1);
    } else {
      const total = daysInMonth(monthCursor.y, monthCursor.m);
      const dayAfterLast = addCalendarDays({ y: monthCursor.y, m: monthCursor.m, d: total }, 1);
      start = paddedInstant({ y: monthCursor.y, m: monthCursor.m, d: 1 }, -1);
      end = paddedInstant(dayAfterLast, 1);
    }

    const res = await fetch(`/api/admin/shifts?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setShifts(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, view, weekStart, monthCursor]);

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

  function goPrev() {
    if (view === "week") setWeekStart((w) => addCalendarDays(w, -7));
    else setMonthCursor((c) => addMonths(c.y, c.m, -1));
  }

  function goNext() {
    if (view === "week") setWeekStart((w) => addCalendarDays(w, 7));
    else setMonthCursor((c) => addMonths(c.y, c.m, 1));
  }

  function goToday() {
    if (view === "week") {
      setWeekStart(currentWeekStart());
    } else {
      const today = ymdInTimezone(new Date(), STUDIO_TIMEZONE);
      setMonthCursor({ y: today.y, m: today.m });
    }
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
    for (const day of visibleDays) map.set(dateKey(day), []);
    for (const shift of visibleShifts) {
      const key = dateKey(ymdInTimezone(new Date(shift.start_at), STUDIO_TIMEZONE));
      map.get(key)?.push(shift);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return map;
  }, [visibleShifts, visibleDays]);

  const todayKey = dateKey(ymdInTimezone(new Date(), STUDIO_TIMEZONE));

  const rangeLabel =
    view === "week"
      ? `${fmtDayLabel(weekDays[0])} - ${fmtDayLabel(weekDays[6])}`
      : `${MONTH_NAMES[monthCursor.m - 1]} ${monthCursor.y}`;

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
        {/* Nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className={`${vulfMono.className} rounded-lg border border-black/15 px-3 py-1.5 text-xs text-neutral-600 hover:bg-black/5 transition-colors`}
            >
              TODAY
            </button>
            <ViewToggle value={view} onChange={setView} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className={`${vulfMono.className} text-sm font-bold whitespace-nowrap`}>{rangeLabel}</h2>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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

        {loading ? (
          <div className="py-20 text-center text-sm text-neutral-400">Loading...</div>
        ) : view === "week" ? (
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
        ) : (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-black/8">
              {DAY_LABELS.map((d) => (
                <div key={d} className={`${vulfMono.className} text-[10px] text-neutral-400 text-center py-2`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7">
              {monthGrid.map((day, i) => {
                if (!day) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="min-h-[100px] border-b border-r border-black/5 bg-neutral-50/50"
                    />
                  );
                }
                const key = dateKey(day);
                const dayShifts = shiftsByDay.get(key) ?? [];
                const visible = dayShifts.slice(0, 3);
                const overflow = dayShifts.length - visible.length;
                const isToday = key === todayKey;
                const isLastRow = i >= monthGrid.length - 7;
                const isLastCol = (i + 1) % 7 === 0;

                return (
                  <div
                    key={key}
                    className={`min-h-[100px] p-1.5 ${isLastRow ? "" : "border-b"} ${
                      isLastCol ? "" : "border-r"
                    } border-black/5`}
                  >
                    <div
                      className={`${vulfMono.className} text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? "bg-[#519A70] text-white font-bold" : "text-neutral-500"
                      }`}
                    >
                      {day.d}
                    </div>
                    <div className="space-y-0.5">
                      {visible.map((shift) => (
                        <MonthShiftLine key={shift.id} shift={shift} />
                      ))}
                      {overflow > 0 && (
                        <p className={`${vulfMono.className} text-[10px] text-neutral-400`}>+{overflow} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
