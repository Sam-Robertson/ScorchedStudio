(function () {
  "use strict";
  const S = window.Scorched;
  const { api, fmt, dates, ui, viz, range, journal } = S;
  const h = ui.h;

  const MARKETING_CODE = "6200";
  const LAUNCH = dates.ONLINE_BOOKING_LAUNCH;
  const LAUNCH_MONTH = LAUNCH.slice(0, 7);

  // ── Source config (entity colors: a channel keeps its hue everywhere) ─────
  const REFERRAL_OPTIONS = ["Get Out Pass", "Family/Friend", "TikTok", "In-Person/Drive by", "Returning Customer", "Instagram", "Google Search/Maps", "Other"];
  const SOURCE_COLORS = {
    "Get Out Pass": "#884A20", "Family/Friend": "#519A70", "TikTok": "#EF4444", "In-Person/Drive by": "#F59E0B",
    "Returning Customer": "#8B5CF6", "Instagram": "#EC4899", "Google Search/Maps": "#3B82F6", "Other": "#9CA3AF", "(not recorded)": "#D1D5DB",
  };
  const NOT_RECORDED = "(not recorded)";
  const sourceOf = (b) => b.referral_source || NOT_RECORDED;
  const colorOf = (src) => SOURCE_COLORS[src] || "#888888";

  const TIMEFRAME_WINDOW = { day: "last 7 days", week: "last 8 weeks", month: "last 12 months" };
  const TF_OPTIONS = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];
  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

  // ── Booking helpers (ported from the old reporting pages) ────────────────
  const { toDateStr, addDays } = dates;

  function getBuckets(tf) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (tf === "day") {
      return Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { key: toDateStr(d), label: d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }) }; });
    }
    if (tf === "week") {
      const out = [];
      for (let i = 7; i >= 0; i--) { const ws = addDays(today, -(i * 7 + today.getDay())); out.push({ key: toDateStr(ws), label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }); }
      return out;
    }
    const [ly, lm] = LAUNCH.split("-").map(Number);
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      if (d.getFullYear() * 12 + d.getMonth() < ly * 12 + lm - 1) continue;
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) });
    }
    return out;
  }
  function bucketKey(createdAt, tf) {
    const day = dates.denverDateKey(createdAt);
    if (tf === "day") return day;
    if (tf === "month") return day.slice(0, 7);
    const d = new Date(day + "T12:00:00");
    return toDateStr(addDays(d, -d.getDay()));
  }
  function bookingsInTimeFrame(bookings, tf) {
    const keys = new Set(getBuckets(tf).map((b) => b.key));
    return bookings.filter((b) => keys.has(bucketKey(b.created_at, tf)));
  }
  function parseSlotMinutes(slot) {
    const [time, ampm = "AM"] = slot.trim().split(" ");
    const [hh, mm = 0] = time.split(":").map(Number);
    const hours = ampm.toUpperCase() === "PM" && hh !== 12 ? hh + 12 : ampm.toUpperCase() === "AM" && hh === 12 ? 0 : hh;
    return hours * 60 + mm;
  }
  function buildSourceChart(bookings, tf, active) {
    const buckets = getBuckets(tf);
    const set = new Set(buckets.map((b) => b.key));
    const map = {};
    for (const b of buckets) { map[b.key] = {}; for (const s of active) map[b.key][s] = 0; }
    for (const b of bookings) {
      if (b.status !== "confirmed") continue;
      const src = sourceOf(b);
      if (!active.has(src)) continue;
      const key = bucketKey(b.created_at, tf);
      if (!set.has(key)) continue;
      map[key][src] = (map[key][src] || 0) + 1;
    }
    return buckets.map(({ key, label }) => ({ label, ...map[key] }));
  }
  function buildCapacityData(bookings, days) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const seatsByDate = {};
    for (const b of bookings) { if (b.status !== "confirmed") continue; seatsByDate[b.date] = (seatsByDate[b.date] || 0) + b.party_size; }
    const LOOKBACK = 6;
    const series = Array.from({ length: days + LOOKBACK }, (_, i) => { const d = addDays(today, i - (days + LOOKBACK - 1)); return { d, seats: seatsByDate[toDateStr(d)] || 0 }; });
    return series.slice(LOOKBACK).map((row, i) => {
      const win = series.slice(i, i + LOOKBACK + 1);
      const avg7 = win.reduce((s, r) => s + r.seats, 0) / win.length;
      return { label: row.d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), seats: row.seats, avg7: Math.round(avg7 * 10) / 10 };
    });
  }
  function buildHeatmap(bookings) {
    const confirmed = bookings.filter((b) => b.status === "confirmed");
    const slotSet = new Set();
    for (const b of confirmed) if (b.time_slot) slotSet.add(b.time_slot);
    const slots = [...slotSet].sort((a, b) => parseSlotMinutes(a) - parseSlotMinutes(b));
    const cells = {};
    for (const dow of DOW_ORDER) cells[dow] = {};
    for (const b of confirmed) {
      if (!b.time_slot || !b.date) continue;
      const dow = new Date(b.date + "T12:00:00").getDay();
      cells[dow][b.time_slot] = (cells[dow][b.time_slot] || 0) + 1;
    }
    let maxCount = 0;
    for (const dow of DOW_ORDER) for (const s of slots) { const c = cells[dow][s] || 0; if (c > maxCount) maxCount = c; }
    return { slots, cells, maxCount };
  }
  function normalizePhone(phone) {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    return digits.length >= 7 ? digits : null;
  }
  function buildRepeatData(bookings) {
    const confirmed = bookings.filter((b) => b.status === "confirmed");
    const parent = confirmed.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const byEmail = new Map(), byPhone = new Map();
    confirmed.forEach((b, i) => {
      const email = (b.email || "").toLowerCase().trim();
      if (email) { const prev = byEmail.get(email); if (prev == null) byEmail.set(email, i); else union(prev, i); }
      const phone = normalizePhone(b.phone);
      if (phone) { const prev = byPhone.get(phone); if (prev == null) byPhone.set(phone, i); else union(prev, i); }
    });
    const groups = new Map();
    confirmed.forEach((b, i) => { const r = find(i); const g = groups.get(r); if (g) g.push(b); else groups.set(r, [b]); });
    const customers = [...groups.values()];
    for (const bs of customers) bs.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstIds = new Set(customers.map((bs) => bs[0].id));
    const tagged = confirmed.map((b) => ({ ...b, isReturning: !firstIds.has(b.id) }));
    const uniqueCustomers = customers.length;
    const returningCustomers = customers.filter((bs) => bs.length > 1).length;
    const cohortMap = {};
    for (const bs of customers) {
      const month = dates.denverDateKey(bs[0].created_at).slice(0, 7);
      if (!cohortMap[month]) cohortMap[month] = { total: 0, returned: 0 };
      cohortMap[month].total++;
      if (bs.length >= 2) cohortMap[month].returned++;
    }
    const cohortRows = Object.entries(cohortMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
    return { tagged, uniqueCustomers, returningCustomers, cohortRows };
  }
  function buildRepeatChart(tagged, tf) {
    const buckets = getBuckets(tf);
    const set = new Set(buckets.map((b) => b.key));
    const map = {};
    for (const b of buckets) map[b.key] = { New: 0, Returning: 0 };
    for (const b of tagged) { const key = bucketKey(b.created_at, tf); if (!set.has(key)) continue; if (b.isReturning) map[key].Returning++; else map[key].New++; }
    return buckets.map(({ key, label }) => ({ label, ...map[key] }));
  }
  function bookingsInRange(bookings, query) {
    const { start, end } = range.bounds(query);
    if (!start && !end) return bookings;
    return bookings.filter((b) => { const d = dates.denverDateKey(b.created_at); if (start && d < start) return false; if (end && d > end) return false; return true; });
  }
  function topChannel(bookings) {
    const counts = new Map();
    for (const b of bookings) { if (b.status !== "confirmed") continue; const src = sourceOf(b); counts.set(src, (counts.get(src) || 0) + 1); }
    let best = null;
    for (const [source, count] of counts) if (!best || count > best.count) best = { source, count };
    return best;
  }
  const monthEndOf = (key) => dates.monthEnd(key);
  // shared.js leaves the tick callback undefined when no xTick is given, which prints indices; pass identity instead.
  const keepLabel = (l) => l;

  // ── Data cache ───────────────────────────────────────────────────────────
  const cache = new Map();
  function load(path, query) {
    const url = query ? `${path}?${query}` : path;
    if (!cache.has(url)) {
      const p = api.get(url);
      p.settled = false;
      p.then(() => { p.settled = true; }, () => { p.settled = true; cache.delete(url); });
      cache.set(url, p);
    }
    return cache.get(url);
  }
  const loadBookings = () => load("/api/admin/bookings");
  const loadCosts = (q) => load("/api/admin/accounting/reports/costs", q);
  const loadEstimated = (q) => load("/api/admin/accounting/reports/estimated-bookings", q);
  const loadSales = (q) => load("/api/admin/accounting/reports/sales", q);

  // ── Page state ───────────────────────────────────────────────────────────
  const state = {
    shell: null, query: "", location: "all",
    marketing: { sourceTf: "week", hidden: new Set(), sort: { col: "count", dir: "desc" }, drillMonth: null },
    capacity: { capDays: 30, repeatTf: "week" },
    sales: { metric: "sales", dow: null, showDetail: false, detailSort: { col: "date", dir: "desc" }, jump: "" },
  };
  const locFilter = (bookings) => (state.location === "all" ? bookings : bookings.filter((b) => b.location === state.location));

  /** Resolve loaders, keeping the previous render dimmed while refetching, then build and mount. */
  async function withData(view, loaders, build) {
    const seq = (view._seq = (view._seq || 0) + 1);
    const ready = loaders.every((p) => p.settled);
    if (!ready) {
      if (view.childElementCount && !view.querySelector(":scope > .state")) view.classList.add("refreshing");
      else ui.replace(view, ui.loading());
    }
    try {
      const data = await Promise.all(loaders);
      if (seq !== view._seq) return;
      const after = [];
      const nodes = build(data, after);
      ui.replace(view, ...nodes);
      view.classList.remove("refreshing");
      for (const fn of after) fn();
    } catch (e) {
      if (seq !== view._seq) return;
      view.classList.remove("refreshing");
      if (e.status === 401) return;
      ui.replace(view, ui.error(e.message || "Failed to load"));
    }
  }

  function chartHost(height) { const el = h("div", { class: "chart" }); el.style.height = height + "px"; return el; }

  // (The old Overview tab's insights card and headline tiles now live on the
  // Home tab, see home.js; its booking tiles moved into Bookings & Capacity.)

  // ── Marketing ────────────────────────────────────────────────────────────
  function renderMarketing() {
    const view = state.shell.views.marketing;
    const q = state.query;
    const m = state.marketing;
    withData(view, [loadCosts(q), loadEstimated(q), loadBookings()], ([costs, estimated, allBookings], after) => {
      const c = viz.colors();
      const bookings = locFilter(allBookings);
      const confirmed = bookings.filter((b) => b.status === "confirmed");
      const rangedConfirmed = bookingsInRange(confirmed, q);
      const rangedBookings = bookingsInRange(bookings, q);
      const { start, end } = range.bounds(q);

      // KPI row
      const breakdown = costs.breakdown || [];
      const marketingSpend = breakdown.filter((b) => b.code === MARKETING_CODE).reduce((s, b) => s + b.amount, 0);
      const marketingName = (breakdown.find((b) => b.code === MARKETING_CODE) || {}).name || "Marketing";
      const top = topChannel(rangedConfirmed);
      let estimatedInRange = 0;
      for (const row of estimated.daily || []) {
        if (row.date >= LAUNCH) continue;
        if (start && row.date < start) continue;
        if (end && row.date > end) continue;
        estimatedInRange += row.orders;
      }
      const bookingsForCost = rangedConfirmed.length + estimatedInRange;
      const costPerBooking = bookingsForCost > 0 ? marketingSpend / bookingsForCost : null;
      const kpis = ui.kpis(4, [
        ui.kpi({ label: "Marketing spend", value: fmt.money0(marketingSpend), sub: "account 6200, selected range" }),
        ui.kpi({ label: "Confirmed bookings", value: rangedConfirmed.length.toLocaleString("en-US"), sub: estimatedInRange > 0 ? `selected range, plus ~${estimatedInRange.toLocaleString("en-US")} estimated pre-launch` : "selected range" }),
        ui.kpi({ label: "Cost per booking", value: costPerBooking == null ? "--" : fmt.money0(costPerBooking), sub: estimatedInRange > 0 ? "spend / bookings (incl. pre-launch estimate)" : "spend / confirmed bookings" }),
        ui.kpi({ label: "Top channel", value: top ? top.source : "--", sub: top ? `${top.count} confirmed bookings` : "no bookings in range" }),
      ]);

      // Spend vs bookings by month (two single-axis charts, same months)
      const spendByMonth = new Map();
      for (const row of costs.monthlyCategories || []) {
        const val = row[marketingName];
        if (typeof val !== "number") continue;
        const key = String(row.period_month).slice(0, 7);
        spendByMonth.set(key, (spendByMonth.get(key) || 0) + val);
      }
      const bookingsByMonth = new Map();
      for (const b of rangedConfirmed) { const key = dates.denverDateKey(b.created_at).slice(0, 7); bookingsByMonth.set(key, (bookingsByMonth.get(key) || 0) + 1); }
      const estByMonth = new Map();
      for (const row of estimated.daily || []) { if (row.date >= LAUNCH) continue; const key = row.date.slice(0, 7); estByMonth.set(key, (estByMonth.get(key) || 0) + row.orders); }
      const months = start && end ? dates.monthsBetween(start, end) : [...new Set([...spendByMonth.keys(), ...bookingsByMonth.keys(), ...estByMonth.keys()])].sort();
      const monthLabels = months.map((mk) => fmt.monthShort(mk + "-01"));
      const spendData = months.map((mk) => Math.max(0, Math.round((spendByMonth.get(mk) || 0) * 100) / 100));
      const bookData = months.map((mk) => (bookingsByMonth.has(mk) ? bookingsByMonth.get(mk) : null));
      const estData = months.map((mk) => (estByMonth.has(mk) ? estByMonth.get(mk) : null));

      let spendCard;
      if (months.length === 0) {
        spendCard = ui.card({ title: "Marketing spend vs. bookings by month", body: ui.empty("No data in this range.") });
      } else {
        const spendHost = chartHost(190), bookHost = chartHost(170);
        const drillWrap = h("div");
        const body = [
          h("p", { class: "chart-label", text: "Marketing spend, $ per month. Click a bar for that month's charges." }),
          spendHost,
          h("p", { class: "chart-label", text: "Bookings per month" }),
          bookHost,
          viz.legend([
            { label: "Marketing spend", color: c.brown, kind: "rect" },
            { label: "Confirmed bookings", color: c.green, kind: "line" },
            { label: "Estimated bookings (pre-launch)", color: c.green, kind: "dash" },
          ]),
          drillWrap,
        ];
        spendCard = ui.card({
          title: "Marketing spend vs. bookings by month", body, bodyClass: "tight",
          note: `Spend from the accounting ledger (account 6200); bookings counted by the date they were made. Online booking launched ${fmt.monthLong(LAUNCH)}. Before that, "estimated" counts Square orders with a General Admission item (booked through Acuity Scheduling). A month where refunds exceeded spend floors at $0 here. Click that bar for the real net total.`,
        });
        after.push(() => {
          viz.bar(spendHost, {
            labels: monthLabels, datasets: [{ label: "Marketing spend", data: spendData, color: c.brown }], format: "money", height: 190,
            xTick: fmt.monthTick, dim: (i) => m.drillMonth != null && months[i] !== m.drillMonth,
            onClick: (i) => { m.drillMonth = m.drillMonth === months[i] ? null : months[i]; renderMarketing(); },
          });
          viz.line(bookHost, {
            labels: monthLabels, format: "count", height: 170, xTick: fmt.monthTick,
            datasets: [
              { label: "Confirmed bookings", data: bookData, color: c.green },
              { label: "Estimated bookings", data: estData, color: c.green, dash: true },
            ],
          });
          if (m.drillMonth) {
            const host = h("div");
            drillWrap.append(h("div", { class: "drill-panel" },
              h("div", { class: "drill-head" },
                h("p", { class: "drill-title", text: `Marketing charges, ${fmt.monthShort(m.drillMonth + "-01")}` }),
                h("button", { class: "link-btn", type: "button", text: "Close", onClick: () => { m.drillMonth = null; renderMarketing(); } })),
              host));
            journal.mount(host, { from: m.drillMonth + "-01", to: monthEndOf(m.drillMonth), accountCodes: [MARKETING_CODE] });
          }
        });
      }

      // Bookings by source over time
      const seen = new Set();
      for (const b of rangedConfirmed) seen.add(sourceOf(b));
      const presentSources = [...REFERRAL_OPTIONS.filter((o) => seen.has(o)), ...[...seen].filter((s) => !REFERRAL_OPTIONS.includes(s))];
      const activeSources = new Set(presentSources.filter((s) => !m.hidden.has(s)));
      const activeList = [...activeSources];
      const sourceData = buildSourceChart(rangedConfirmed, m.sourceTf, activeSources);
      const tfSeg = ui.seg(TF_OPTIONS, m.sourceTf, (v) => { m.sourceTf = v; renderMarketing(); }, "Bucket size");
      let sourceCard;
      if (presentSources.length === 0) {
        sourceCard = ui.card({ title: "Bookings by source over time", action: tfSeg, body: ui.empty("No bookings in this range.") });
      } else {
        const pills = h("div", { class: "pills" }, presentSources.map((src) => {
          const active = !m.hidden.has(src);
          const color = colorOf(src);
          return h("button", {
            class: "pill", type: "button", "aria-pressed": String(active), style: active ? { background: color } : {},
            onClick: () => { if (m.hidden.has(src)) m.hidden.delete(src); else m.hidden.add(src); renderMarketing(); },
          }, h("span", { class: "dot", style: { background: color } }), src);
        }));
        const host = chartHost(260);
        sourceCard = ui.card({ title: "Bookings by source over time", action: tfSeg, body: [pills, host], bodyClass: "tight" });
        after.push(() => {
          viz.bar(host, {
            labels: sourceData.map((d) => d.label), stacked: true, format: "count", height: 260, barThickness: 24, xTick: keepLabel,
            datasets: activeList.map((src) => ({ label: src, data: sourceData.map((d) => d[src] || 0), color: colorOf(src) })),
          });
        });
      }

      // Breakdown table
      const tableBookings = bookingsInTimeFrame(rangedBookings, m.sourceTf).filter((b) => !m.hidden.has(sourceOf(b)));
      const tableConfirmedCount = tableBookings.filter((b) => b.status === "confirmed").length;
      const data = {};
      for (const b of tableBookings) {
        const src = sourceOf(b);
        if (!data[src]) data[src] = { conf: 0, canc: 0, seats: 0, rev: 0 };
        if (b.status === "confirmed") { data[src].conf++; data[src].seats += b.party_size; data[src].rev += b.amount_paid || 0; }
        else data[src].canc++;
      }
      const rows = [
        ...REFERRAL_OPTIONS.filter((o) => data[o]).map((o) => ({ label: o, ...data[o] })),
        ...Object.entries(data).filter(([k]) => !REFERRAL_OPTIONS.includes(k)).map(([k, v]) => ({ label: k, ...v })),
      ].map((r) => {
        const total = r.conf + r.canc;
        return { ...r, total, share: tableConfirmedCount > 0 ? (r.conf / tableConfirmedCount) * 100 : 0, avgParty: r.conf > 0 ? r.seats / r.conf : 0, avgRev: r.conf > 0 ? r.rev / r.conf : 0, cancelPct: total > 0 ? Math.round((r.canc / total) * 100) : 0 };
      });
      const sorted = ui.sortRows(rows, m.sort, { count: (r) => r.conf, revenue: (r) => r.avgRev, party: (r) => r.avgParty, cancel: (r) => (r.total > 0 ? r.canc / r.total : 0) });
      const others = tableBookings.filter((b) => b.referral_source === "Other" && b.referral_other).map((b) => b.referral_other);
      let tableCard;
      if (tableBookings.length === 0) {
        tableCard = ui.card({ title: `Breakdown by source, ${TIMEFRAME_WINDOW[m.sourceTf]}`, body: ui.empty("No bookings in this window.") });
      } else {
        const tbl = ui.table({
          columns: [
            { key: "label", label: "Source", sticky: true, cell: (r) => h("span", { class: "src" }, h("span", { class: "dot", style: { background: colorOf(r.label) } }), r.label) },
            { key: "count", label: "Bookings", align: "r", sortable: true, strong: true, cell: (r) => String(r.conf) },
            { key: "share", label: "Share", align: "r", cell: (r) => ui.share(r.share, colorOf(r.label)) },
            { key: "party", label: "Avg party", align: "r", sortable: true, cell: (r) => (r.conf > 0 ? r.avgParty.toFixed(1) : "--") },
            { key: "revenue", label: "Avg revenue", align: "r", sortable: true, cell: (r) => (r.conf > 0 ? fmt.cents(Math.round(r.avgRev)) : "--") },
            { key: "cancel", label: "Cancel rate", align: "r", sortable: true, cell: (r) => h("span", {}, h("span", { class: r.cancelPct > 20 ? "neg" : "muted", text: r.cancelPct + "%" }), r.canc > 0 ? h("span", { class: "muted", text: ` (${r.canc})` }) : null) },
          ],
          rows: sorted, sort: m.sort, onSort: (col) => { m.sort = ui.nextSort(m.sort, col, "desc"); renderMarketing(); },
        });
        const body = [tbl];
        if (others.length) body.push(h("details", { class: "other" }, h("summary", { text: `"Other" responses (${others.length})` }), h("ul", { class: "other-list" }, others.map((d) => h("li", { text: d })))));
        tableCard = ui.card({ title: `Breakdown by source, ${TIMEFRAME_WINDOW[m.sourceTf]}`, body, bodyClass: "flush" });
      }
      return [kpis, spendCard, sourceCard, tableCard];
    });
  }

  // ── Bookings & Capacity ──────────────────────────────────────────────────
  function renderBookings() {
    const view = state.shell.views.bookings;
    const q = state.query;
    const cp = state.capacity;
    withData(view, [loadBookings(), loadEstimated(q)], ([allBookings, estimated], after) => {
      const c = viz.colors();
      const bookings = locFilter(allBookings);
      const confirmed = bookings.filter((b) => b.status === "confirmed");
      const ranged = bookingsInRange(bookings, q);
      const rangedConfirmed = ranged.filter((b) => b.status === "confirmed");
      const rangedCancelled = ranged.filter((b) => b.status === "cancelled");
      const avgParty = rangedConfirmed.length ? rangedConfirmed.reduce((s, b) => s + b.party_size, 0) / rangedConfirmed.length : 0;
      const cancelRate = ranged.length > 0 ? rangedCancelled.length / ranged.length : 0;
      const top = topChannel(rangedConfirmed);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const thisWeekStart = toDateStr(addDays(today, -6)), todayStr = toDateStr(today);
      const lastWeekStart = toDateStr(addDays(today, -13)), lastWeekEnd = toDateStr(addDays(today, -7));
      let thisWeek = 0, lastWeek = 0;
      for (const b of confirmed) {
        if (b.date >= thisWeekStart && b.date <= todayStr) thisWeek += b.party_size;
        else if (b.date >= lastWeekStart && b.date <= lastWeekEnd) lastWeek += b.party_size;
      }
      const deltaPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
      const repAll = buildRepeatData(bookings);
      const repeatRateAll = repAll.uniqueCustomers > 0 ? repAll.returningCustomers / repAll.uniqueCustomers : 0;
      const kpis = ui.kpis(3, [
        ui.kpi({ label: "Confirmed bookings", value: rangedConfirmed.length.toLocaleString("en-US"), sub: "made in the selected range" }),
        ui.kpi({ label: "Booked seats this week", value: thisWeek.toLocaleString("en-US"), sub: deltaPct == null ? "no seats booked last week" : `${fmt.signedPct(deltaPct)} vs last week`, subTone: deltaPct == null ? undefined : deltaPct >= 0 ? "good" : "bad" }),
        ui.kpi({ label: "Top channel", value: top ? top.source : "--", sub: top ? `${top.count} confirmed bookings in range` : "how customers found us" }),
        ui.kpi({ label: "Avg party size", value: rangedConfirmed.length ? avgParty.toFixed(1) : "--", sub: "confirmed bookings in range" }),
        ui.kpi({ label: "Cancellation rate", value: fmt.pct(cancelRate), sub: `${rangedCancelled.length} of ${ranged.length} made in range`, subTone: cancelRate > 0.2 ? "bad" : undefined }),
        ui.kpi({ label: "Repeat customer rate", value: fmt.pct(repeatRateAll), sub: `${repAll.returningCustomers} of ${repAll.uniqueCustomers} customers booked again, all time` }),
      ]);

      // Booked seats per day
      const capData = buildCapacityData(bookings, cp.capDays);
      const daysSeg = ui.seg([30, 60, 90].map((d) => ({ value: d, label: d + "d" })), cp.capDays, (v) => { cp.capDays = v; renderBookings(); }, "Window");
      const capHost = chartHost(220);
      const capCard = ui.card({
        title: "Booked seats per day", action: daysSeg, bodyClass: "tight",
        body: [capHost, viz.legend([{ label: "Seats booked", color: c.green, kind: "rect" }, { label: "7-day rolling average", color: c.brown, kind: "line" }])],
        note: "Booked seats by session date. The line is the average of that day and the previous six. Read it for trend and week-over-week direction, not against a capacity ceiling.",
      });
      after.push(() => viz.mixed(capHost, {
        labels: capData.map((d) => d.label), format: "count", height: 220, barThickness: 20, xTick: keepLabel,
        bars: [{ label: "Seats booked", data: capData.map((d) => d.seats), color: c.green }],
        lines: [{ label: "7-day average", data: capData.map((d) => d.avg7), color: c.brown }],
      }));

      // Seats by month
      const realByMonth = new Map();
      for (const b of confirmed) { const key = b.date.slice(0, 7); realByMonth.set(key, (realByMonth.get(key) || 0) + b.party_size); }
      const estByMonth = new Map();
      for (const row of estimated.daily || []) { if (row.date >= LAUNCH) continue; const key = row.date.slice(0, 7); estByMonth.set(key, (estByMonth.get(key) || 0) + row.seats); }
      const { start, end } = range.bounds(q);
      const months = start && end ? dates.monthsBetween(start, end) : [...new Set([...realByMonth.keys(), ...estByMonth.keys()])].sort();
      const monthly = months.map((mk) => {
        const isEstimate = mk < LAUNCH_MONTH, isMixed = mk === LAUNCH_MONTH;
        return { key: mk, label: fmt.monthShort(mk + "-01"), seats: isEstimate ? (estByMonth.get(mk) || 0) : (realByMonth.get(mk) || 0) + (isMixed ? (estByMonth.get(mk) || 0) : 0), estimated: isEstimate, mixed: isMixed };
      });
      let monthCard;
      if (monthly.length === 0) {
        monthCard = ui.card({ title: "Seats booked by month", body: ui.empty("No data in this range.") });
      } else {
        const host = chartHost(220);
        monthCard = ui.card({
          title: "Seats booked by month", bodyClass: "tight",
          body: [host, viz.legend([{ label: "Booked (real)", color: c.green, kind: "rect" }, { label: "Estimated (pre-launch)", color: c.greenSoft, kind: "rect" }])],
          note: `Online booking launched ${fmt.monthLong(LAUNCH)}. Before that the online widget has no records at all. The lighter bars estimate seats from Square orders with a General Admission item (booked through Acuity Scheduling), so treat them as directional, not exact. The launch month combines both.`,
        });
        after.push(() => viz.bar(host, {
          labels: monthly.map((d) => d.label), format: "count", height: 220, xTick: fmt.monthTick,
          datasets: [{ label: "Seats", data: monthly.map((d) => d.seats), color: monthly.map((d) => (d.estimated ? c.greenSoft : c.green)) }],
        }));
      }

      // Heatmap
      const heat = buildHeatmap(bookings);
      let heatCard;
      if (heat.slots.length === 0) {
        heatCard = ui.card({ title: "Booking heatmap, day of week vs time slot", body: ui.empty("No booking data yet.") });
      } else {
        const grid = h("div", { class: "heat", style: { gridTemplateColumns: `44px repeat(${heat.slots.length}, minmax(42px, 1fr))` } });
        grid.append(h("div", { class: "hd" }));
        for (const slot of heat.slots) grid.append(h("div", { class: "hl", text: slot }));
        DOW_ORDER.forEach((dow, rowIdx) => {
          grid.append(h("div", { class: "hd", text: DOW_LABELS[rowIdx] }));
          for (const slot of heat.slots) {
            const count = (heat.cells[dow] && heat.cells[dow][slot]) || 0;
            const intensity = heat.maxCount > 0 ? count / heat.maxCount : 0;
            const bg = intensity === 0 ? "var(--line-2)" : `rgba(var(--heat), ${(0.15 + intensity * 0.85).toFixed(2)})`;
            grid.append(h("div", {
              class: "hc", title: `${DOW_LABELS[rowIdx]} ${slot}: ${count} booking${count === 1 ? "" : "s"}`, tabindex: "0",
              style: { background: bg, color: intensity > 0.5 ? "#fff" : "var(--ink)" }, text: count > 0 ? String(count) : "",
            }));
          }
        });
        heatCard = ui.card({ title: "Booking heatmap, day of week vs time slot", body: h("div", { class: "heat-wrap" }, grid), note: "All confirmed bookings by day of week and session time. Darker means more bookings." });
      }

      // Repeat customers
      const rep = buildRepeatData(bookings);
      const repeatRate = rep.uniqueCustomers > 0 ? rep.returningCustomers / rep.uniqueCustomers : 0;
      const repChart = buildRepeatChart(rep.tagged, cp.repeatTf);
      const repSeg = ui.seg(TF_OPTIONS, cp.repeatTf, (v) => { cp.repeatTf = v; renderBookings(); }, "Bucket size");
      const repHost = chartHost(200);
      const repBody = [
        h("div", { class: "row-between" },
          h("p", { class: "chart-label", text: "New vs. returning over time" }),
          h("p", { class: "subtle-line" }, "Repeat rate: ", h("strong", { text: fmt.pct(repeatRate) }), h("span", { class: "muted", text: ` (${rep.returningCustomers} of ${rep.uniqueCustomers} unique customers)` }))),
      ];
      if (rep.tagged.length === 0) repBody.push(ui.empty("No confirmed bookings yet."));
      else repBody.push(repHost, viz.legend([{ label: "New", color: c.green, kind: "rect" }, { label: "Returning", color: c.brown, kind: "rect" }]));
      const cohortTbl = rep.cohortRows.length === 0 ? ui.empty("Not enough data yet.") : ui.table({
        columns: [
          { key: "month", label: "First booking month", cell: (r) => fmt.monthLong(r.month + "-01") },
          { key: "total", label: "New customers", align: "r", cell: (r) => String(r.total) },
          { key: "returned", label: "Booked again", align: "r", cell: (r) => String(r.returned) },
          { key: "pct", label: "Retention", align: "r", cell: (r) => ui.share(r.total > 0 ? (r.returned / r.total) * 100 : 0) },
        ],
        rows: rep.cohortRows,
      });
      const repCard = ui.card({ title: "Repeat customers", action: repSeg, bodyClass: "tight", body: repBody });
      repCard.append(
        h("div", { style: { borderTop: "1px solid var(--line)" } }, h("p", { class: "chart-label", style: { padding: "12px 18px 4px" }, text: "Monthly cohort retention" }), cohortTbl),
        ui.note("Identity is matched by phone number or email (not email alone), so a group booking under a different guest email still counts as the same customer when the phone matches. Still imperfect: a shared family phone can merge two people, and a new email plus a new phone looks like a new customer. Not based on the self-reported \"Returning Customer\" source label. Cohort retention is the share of first-time customers in that month who made at least one more booking."),
      );
      after.push(() => { if (rep.tagged.length) viz.bar(repHost, {
        labels: repChart.map((d) => d.label), stacked: true, format: "count", height: 200, xTick: keepLabel,
        datasets: [{ label: "New", data: repChart.map((d) => d.New), color: c.green }, { label: "Returning", data: repChart.map((d) => d.Returning), color: c.brown }],
      }); });

      return [kpis, capCard, monthCard, heatCard, repCard];
    });
  }

  // ── Sales & Products ─────────────────────────────────────────────────────
  function renderSales() {
    const view = state.shell.views.sales;
    const q = state.query;
    const sl = state.sales;
    const loaders = [loadSales(q)];
    if (sl.showDetail) loaders.push(loadSales(""));
    withData(view, loaders, ([sales, allSales], after) => {
      const c = viz.colors();
      const isCount = sl.metric === "count";
      const money = (v) => fmt.money0(v), countF = (v) => fmt.count(v);
      const fmtV = isCount ? countF : money;
      const format = isCount ? "count" : "money";
      const dataStartsAt = sales.dataStartsAt || dates.DATA_STARTS_AT;
      const rangeSub = q ? "selected range, Square only" : `since ${fmt.dateShort(dataStartsAt)} (grand opening), Square only`;
      const orderDays = (sales.daily || []).filter((d) => d.date >= dataStartsAt);
      const netSales = orderDays.reduce((s, d) => s + d.netSales, 0);
      const itemsByDate = new Map((sales.dailyOrderStats || []).map((d) => [d.date, d.items]));
      const salesByDate = new Map(orderDays.map((d) => [d.date, d.netSales]));
      const countDays = (sales.dailyOrderStats || []).filter((d) => d.date >= dataStartsAt);
      const stats = sales.orderStats || {};
      const seriesKey = isCount ? "Items sold" : "Net sales";

      const metricSeg = ui.seg([{ value: "sales", label: "Sales" }, { value: "count", label: "Items sold" }], sl.metric, (v) => { sl.metric = v; renderSales(); }, "Metric");
      const kpis = ui.kpis(4, [
        isCount ? ui.kpi({ label: "Items Sold", value: fmt.count(stats.totalItems || 0), sub: rangeSub }) : ui.kpi({ label: "Square Net Sales", value: fmt.money0(netSales), sub: rangeSub }),
        ui.kpi({ label: "Total Orders", value: (stats.totalOrders || 0).toLocaleString("en-US"), sub: `${stats.daysWithOrderData || 0} days with order data` }),
        ui.kpi({ label: "Avg Order Value", value: fmt.money2(stats.avgOrderValue || 0), sub: "gross, before discounts and refunds" }),
        ui.kpi({ label: "Avg Items per Order", value: (stats.avgItemsPerOrder || 0).toFixed(1) }),
      ]);

      // Top items
      const topRows = [...(sales.topItems || [])].sort((a, b) => (isCount ? b.quantity - a.quantity : b.revenue - a.revenue)).slice(0, 10);
      const narrow = window.innerWidth < 640;
      const maxChars = narrow ? 16 : 28;
      let topCard;
      if (topRows.length === 0) topCard = ui.card({ title: isCount ? "Top Items by Units Sold" : "Top Items by Revenue", body: ui.empty("No order data in this range.") });
      else {
        const hgt = Math.max(220, topRows.length * 30 + 40);
        const host = chartHost(hgt);
        topCard = ui.card({ title: isCount ? "Top Items by Units Sold" : "Top Items by Revenue", body: host, bodyClass: "tight", note: "Top 10 Square line items. Square items carry no category, so this stands in for a revenue-by-category view." + (sales.topItemsApprox ? " For a custom date range the top items cover all history; the other figures on this tab follow the range." : "") });
        after.push(() => viz.bar(host, {
          horizontal: true, labels: topRows.map((t) => t.name), format, height: hgt, barThickness: 18,
          xTick: (label) => (String(label).length > maxChars ? String(label).slice(0, maxChars - 1).trimEnd() + "…" : label),
          datasets: [{ label: seriesKey, data: topRows.map((t) => (isCount ? t.quantity : t.revenue)), color: c.brown }],
        }));
      }

      // Day of week
      const sums = new Map();
      const source = isCount ? countDays.map((d) => ({ date: d.date, value: d.items })) : orderDays.map((d) => ({ date: d.date, value: d.netSales }));
      for (const d of source) { const dow = dates.dowIndex(d.date); sums.set(dow, (sums.get(dow) || 0) + d.value); }
      const dowData = [...sums.entries()].map(([dow, value]) => ({ dow, day: dates.DOW_NAMES[dow], value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
      let dowCard;
      if (dowData.length === 0) dowCard = ui.card({ title: isCount ? "Items Sold by Day of Week" : "Revenue by Day of Week", body: ui.empty("No order data in this range.") });
      else {
        const host = chartHost(260);
        dowCard = ui.card({
          title: isCount ? "Items Sold by Day of Week" : "Revenue by Day of Week", body: host, bodyClass: "tight",
          note: sl.dow == null ? "Order days only (backfill months excluded). Click a bar to filter the daily chart below." : `Filtering the daily chart to ${dates.DOW_NAMES[sl.dow]}s. Click the bar again to reset.`,
        });
        after.push(() => viz.bar(host, {
          labels: dowData.map((d) => d.day), format, height: 260, xTick: (l) => String(l).slice(0, 3),
          datasets: [{ label: seriesKey, data: dowData.map((d) => d.value), color: dowData.map((d) => (sl.dow === d.dow ? c.brown : c.green)) }],
          dim: (i) => sl.dow != null && dowData[i].dow !== sl.dow,
          onClick: (i) => { const d = dowData[i].dow; sl.dow = sl.dow === d ? null : d; renderSales(); },
        }));
      }

      // Daily chart
      const baseDays = isCount ? countDays.map((d) => d.date) : orderDays.map((d) => d.date);
      const filteredDays = sl.dow == null ? baseDays : baseDays.filter((d) => dates.dowIndex(d) === sl.dow);
      const dailyVals = filteredDays.map((d) => (isCount ? itemsByDate.get(d) || 0 : salesByDate.get(d) || 0));
      const dailyAvg = dailyVals.length ? dailyVals.reduce((s, v) => s + v, 0) / dailyVals.length : 0;
      const dailyMax = dailyVals.length ? Math.max(...dailyVals) : 0;
      const dailyTitle = `Daily ${isCount ? "Items Sold" : "Revenue"}${sl.dow == null ? "" : ` (${dates.DOW_NAMES[sl.dow]}s only)`}`;
      const resetBtn = sl.dow != null ? h("button", { class: "btn", type: "button", text: "Reset filter", onClick: () => { sl.dow = null; renderSales(); } }) : null;
      let dailyCard;
      if (filteredDays.length === 0) dailyCard = ui.card({ title: dailyTitle, action: resetBtn, body: ui.empty("No order data in this range.") });
      else {
        const host = chartHost(280);
        const filtered = sl.dow != null;
        dailyCard = ui.card({
          title: dailyTitle, action: resetBtn, bodyClass: "tight",
          body: [host, viz.legend([
            { label: `Avg ${fmtV(dailyAvg)}`, color: c.brown, kind: "dash" },
            ...(filtered ? [] : [{ label: `Max ${fmtV(dailyMax)}`, color: c.ink3, kind: "dash" }]),
          ])],
        });
        after.push(() => viz.line(host, {
          labels: filteredDays.map((d) => fmt.dateShort(d)), format, height: 280, xTick: keepLabel,
          datasets: [{ label: seriesKey, data: dailyVals, color: c.green, area: !filtered, points: filtered }],
          refLines: [
            { value: dailyAvg, label: narrow ? "" : `Avg ${fmtV(dailyAvg)}`, color: c.brown, dash: [4, 4] },
            ...(filtered ? [] : [{ value: dailyMax, label: narrow ? "" : `Max ${fmtV(dailyMax)}`, color: c.ink3, dash: [2, 4] }]),
          ],
        }));
      }

      // Daily detail (opt-in)
      const toggle = h("div", {}, h("button", { class: "btn", type: "button", "aria-expanded": String(sl.showDetail), text: sl.showDetail ? "Hide daily detail" : "Show daily detail (last 15 days)", onClick: () => { sl.showDetail = !sl.showDetail; renderSales(); } }));
      const out = [h("div", { class: "row-end" }, metricSeg), kpis, h("div", { class: "grid-2" }, topCard, dowCard), dailyCard, toggle];
      if (sl.showDetail && allSales) out.push(buildDailyDetail(allSales));
      return out;
    });
  }

  function buildDailyDetail(all) {
    const sl = state.sales;
    const RECENT = 15, PAD = 3;
    const salesByDate = new Map((all.daily || []).map((d) => [d.date, d.netSales]));
    const allRows = (all.dailyOrderStats || []).map((d) => ({
      date: d.date, dow: dates.dowIndex(d.date), orders: d.orders, items: d.items,
      netSales: salesByDate.has(d.date) ? salesByDate.get(d.date) : null, aov: d.avgOrderValue, gross: d.grossOrderRevenue != null ? d.grossOrderRevenue : d.avgOrderValue * d.orders,
    }));
    let subset;
    if (sl.jump) { const from = dates.shiftDate(sl.jump, -PAD), to = dates.shiftDate(sl.jump, PAD); subset = allRows.filter((r) => r.date >= from && r.date <= to); }
    else subset = [...allRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT);
    const rows = ui.sortRows(subset, sl.detailSort, { date: (r) => r.date, dow: (r) => r.dow, orders: (r) => r.orders, items: (r) => r.items, netSales: (r) => (r.netSales == null ? -1 : r.netSales), aov: (r) => r.aov });
    const totals = rows.reduce((t, r) => ({ orders: t.orders + r.orders, items: t.items + r.items, net: t.net + (r.netSales || 0), gross: t.gross + r.gross }), { orders: 0, items: 0, net: 0, gross: 0 });
    const jumpInput = h("input", { class: "field", type: "date", id: "detail-jump", value: sl.jump, "aria-label": "Jump to date" });
    jumpInput.addEventListener("change", () => { sl.jump = jumpInput.value; renderSales(); });
    const action = h("div", { class: "filters-left" },
      h("label", { class: "lbl", for: "detail-jump", text: "Jump to date" }), jumpInput,
      sl.jump ? h("button", { class: "btn", type: "button", text: "Show recent", onClick: () => { sl.jump = ""; renderSales(); } }) : null);
    const onSort = (col) => { sl.detailSort = ui.nextSort(sl.detailSort, col, "desc"); renderSales(); };
    const body = rows.length === 0 ? ui.empty(sl.jump ? `No order data around ${fmt.dateLong(sl.jump)}.` : "No order data yet.") : ui.table({
      columns: [
        { key: "date", label: "Date", sortable: true, sticky: true, strong: true, cell: (r) => fmt.dateShort(r.date) },
        { key: "dow", label: "Day", sortable: true, cell: (r) => dates.DOW_NAMES[r.dow].slice(0, 3) },
        { key: "orders", label: "Orders", align: "r", sortable: true, cell: (r) => String(r.orders) },
        { key: "items", label: "Items", align: "r", sortable: true, cell: (r) => String(r.items) },
        { key: "netSales", label: "Net Sales", align: "r", sortable: true, cell: (r) => (r.netSales == null ? "--" : fmt.money0(r.netSales)) },
        { key: "aov", label: "Avg Order Value (gross)", align: "r", sortable: true, cell: (r) => fmt.money2(r.aov) },
      ],
      rows, sort: sl.detailSort, onSort,
      total: [`Total (${rows.length} days)`, "", totals.orders.toLocaleString("en-US"), totals.items.toLocaleString("en-US"), fmt.money0(totals.net), totals.orders > 0 ? fmt.money2(totals.gross / totals.orders) : "--"],
    });
    return ui.card({
      title: "Daily Order Detail", action, body, bodyClass: "flush",
      note: (sl.jump ? `Showing ${fmt.dateLong(sl.jump)} plus or minus ${PAD} days.` : `The last ${RECENT} days with Square order data (independent of the page's date range).`) + " Net Sales joined from the daily revenue series by date. Click a column header to sort.",
    });
  }

  // ── Website (Google Analytics) ───────────────────────────────────────────
  // Rows come from the snapshot's web documents (see shared.js). Daily rows
  // filter to the selected range exactly; sources, pages, cities and devices
  // are monthly, so they cover every month the range touches.
  const loadWeb = (name) => load(`/api/admin/web/${name}`);
  const WEB_EVENT_LABELS = {
    booking_confirmed: "Bookings", purchase: "Online payments", course_enrolled: "Course enrollments", membership_started: "Memberships started",
    contact_submitted: "Contact messages", job_application: "Job applications", newsletter_signup: "Newsletter signups", begin_checkout: "Checkouts started",
  };
  const CHANNEL_COLORS = { "Organic Search": "#3B82F6", "Direct": "#884A20", "Organic Social": "#EC4899", "Paid Social": "#EF4444", "Referral": "#519A70", "Email": "#F59E0B", "Paid Search": "#8B5CF6", "Unassigned": "#9CA3AF" };
  const CARRIER_GATEWAYS = { Phoenix: "Arizona", Tempe: "Arizona", Denver: "Colorado", Englewood: "Colorado" };
  const CARRIER_LABEL = "On cellular, location unknown";
  const isCarrierGateway = (city, region) => CARRIER_GATEWAYS[city] === region;
  const channelColor = (name, i) => CHANNEL_COLORS[name] || viz.series(i);
  const sum = (rows, idx) => rows.reduce((s, r) => s + (r[idx] || 0), 0);
  const safeDiv = (a, b) => (b > 0 ? a / b : 0);
  const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
  const vsPrev = (now, before, what) => (before > 0 ? `${fmt.signedPct(pctChange(now, before))} vs previous ${what}` : `no ${what} before this one to compare`);
  const changeTone = (now, before) => (before > 0 ? (now >= before ? "good" : "bad") : undefined);
  const dayCount = (start, end) => Math.round((new Date(end + "T12:00:00") - new Date(start + "T12:00:00")) / 86400000) + 1;
  const monthsTouched = (start, end) => new Set(dates.monthsBetween(start, end));

  // Daily rows bucketed by day, week (Sunday start) or month, depending on how long the range is.
  function webBuckets(start, end) {
    const days = dayCount(start, end);
    const unit = days > 200 ? "month" : days > 45 ? "week" : "day";
    const keyOf = (d) => (unit === "day" ? d : unit === "month" ? d.slice(0, 7) : (() => { const dt = new Date(d + "T12:00:00"); return toDateStr(addDays(dt, -dt.getDay())); })());
    const keys = [];
    for (let d = start; d <= end; d = dates.shiftDate(d, 1)) { const k = keyOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
    const label = (k) => (unit === "month" ? fmt.monthShort(k + "-01") : fmt.dateShort(k));
    return { unit, keys, keyOf, labels: keys.map(label), noun: unit === "day" ? "day" : unit === "week" ? "week" : "month" };
  }

  function renderWebsite() {
    const view = state.shell.views.website;
    withData(view, [loadWeb("meta")], ([meta]) => {
      if (!meta.connected) {
        return [ui.card({
          title: "Google Analytics is not connected",
          body: h("div", { class: "stack", style: "padding: 4px 0 2px" },
            h("p", { class: "closing", text: meta.error ? `The last snapshot could not read Google Analytics: ${meta.error}` : "The daily snapshot has no Google Analytics credentials yet, so this tab has nothing to show." }),
            h("p", { class: "closing", text: "To connect it: enable the Google Analytics Data API in a Google Cloud project, create a service account with a JSON key, add that account as a Viewer on the GA4 property, then set GA_PROPERTY_ID and GA_SERVICE_ACCOUNT_JSON where the snapshot script runs (the .env for a manual refresh, and the Default cloud environment for the daily routine). The next refresh fills this tab." }),
          ),
        })];
      }
      const inner = h("div");
      renderWebsiteData(inner, meta);
      return [inner];
    });
  }

  function renderWebsiteData(view, meta) {
    const bounds = range.bounds(state.query);
    const start = bounds.start && bounds.start > meta.from ? bounds.start : meta.from;
    const end = bounds.end && bounds.end < meta.to ? bounds.end : meta.to;
    withData(view, [loadWeb("daily"), loadWeb("channels"), loadWeb("sources"), loadWeb("pages"), loadWeb("events"), loadWeb("cities"), loadWeb("devices"), loadBookings()], ([daily, channels, sources, pages, events, cities, devices, bookings], after) => {
      const c = viz.colors();
      const days = dayCount(start, end);
      const prevEnd = dates.shiftDate(start, -1), prevStart = dates.shiftDate(start, -days);
      const inRange = (d) => d >= start && d <= end;
      const inPrev = (d) => d >= prevStart && d <= prevEnd;
      const months = monthsTouched(start, end);
      const inMonths = (r) => months.has(r[0]);

      // daily: [date, sessions, users, newUsers, views, engaged, keyEvents, eventCount, engagementSeconds]
      const now = daily.rows.filter((r) => inRange(r[0])), before = daily.rows.filter((r) => inPrev(r[0]));
      const sessions = sum(now, 1), prevSessions = sum(before, 1);
      const users = sum(now, 2), prevUsers = sum(before, 2);
      const newUsers = sum(now, 3);
      const engaged = sum(now, 5), prevEngaged = sum(before, 5);
      const keyEvents = sum(now, 6), prevKeyEvents = sum(before, 6);
      const engagementRate = safeDiv(engaged, sessions), prevEngagementRate = safeDiv(prevEngaged, prevSessions);

      // events: [date, eventName, count, value]
      const eventTotals = (filter) => { const m = new Map(); for (const r of events.rows) if (filter(r[0])) { const e = m.get(r[1]) || { count: 0, value: 0 }; e.count += r[2]; e.value += r[3]; m.set(r[1], e); } return m; };
      const evNow = eventTotals(inRange), evBefore = eventTotals(inPrev);
      const gaBookings = (evNow.get("booking_confirmed") || { count: 0 }).count;
      const prevGaBookings = (evBefore.get("booking_confirmed") || { count: 0 }).count;
      const realBookings = bookings.filter((b) => b.status === "confirmed" && inRange(dates.denverDateKey(b.created_at))).length;
      const convRate = safeDiv(gaBookings, sessions), prevConvRate = safeDiv(prevGaBookings, prevSessions);

      const kpis = ui.kpis(3, [
        ui.kpi({ label: "Sessions", value: fmt.count(sessions), sub: vsPrev(sessions, prevSessions, `${days} days`), subTone: changeTone(sessions, prevSessions) }),
        ui.kpi({ label: "Visitors", value: fmt.count(users), sub: `${fmt.pct(safeDiv(newUsers, users))} new, ${vsPrev(users, prevUsers, "period")}`, subTone: changeTone(users, prevUsers) }),
        ui.kpi({ label: "Engagement rate", value: fmt.pct(engagementRate), sub: prevSessions > 0 ? `${fmt.pct(prevEngagementRate)} the period before` : "sessions that stayed 10s, converted, or viewed 2+ pages", subTone: prevSessions > 0 ? (engagementRate >= prevEngagementRate ? "good" : "bad") : undefined }),
        ui.kpi({ label: "Bookings seen by GA", value: fmt.count(gaBookings), sub: realBookings > 0 ? `${fmt.pct(safeDiv(gaBookings, realBookings))} of the ${fmt.count(realBookings)} bookings made in this range` : "booking_confirmed events", subTone: realBookings > 0 && gaBookings < realBookings * 0.8 ? "bad" : undefined }),
        ui.kpi({ label: "Booking conversion", value: fmt.pct1(convRate), sub: prevSessions > 0 ? `${fmt.pct1(prevConvRate)} the period before` : "bookings per session", subTone: prevSessions > 0 ? (convRate >= prevConvRate ? "good" : "bad") : undefined }),
        ui.kpi({ label: "Key events", value: fmt.count(keyEvents), sub: vsPrev(keyEvents, prevKeyEvents, "period"), subTone: changeTone(keyEvents, prevKeyEvents) }),
      ]);

      // Traffic over time, plus bookings GA saw, on the same buckets.
      const bk = webBuckets(start, end);
      const bucketSum = (rows, idx, dateIdx = 0) => { const m = new Map(); for (const r of rows) { const k = bk.keyOf(r[dateIdx]); m.set(k, (m.get(k) || 0) + r[idx]); } return bk.keys.map((k) => m.get(k) || 0); };
      const sessHost = chartHost(190), bookHost = chartHost(150);
      const bookingRows = events.rows.filter((r) => r[1] === "booking_confirmed" && inRange(r[0]));
      const trafficCard = ui.card({
        title: "Traffic over time", bodyClass: "tight",
        body: [
          h("p", { class: "chart-label", text: `Sessions and visitors per ${bk.noun}` }),
          sessHost,
          h("p", { class: "chart-label", text: `Bookings GA saw per ${bk.noun}` }),
          bookHost,
          viz.legend([{ label: "Sessions", color: c.blue, kind: "line" }, { label: "Visitors", color: c.blue, kind: "dash" }, { label: "Bookings (GA)", color: c.green, kind: "rect" }]),
        ],
        note: "A session is one visit; a visitor can have several. Bookings here are booking_confirmed events the site sends GA when the confirmation page loads, so a booking made by staff, or one whose confirmation page never loaded, is not counted. The tile above says how many of the real bookings GA caught.",
      });
      after.push(() => {
        viz.line(sessHost, { labels: bk.labels, format: "count", height: 190, xTick: keepLabel, datasets: [
          { label: "Sessions", data: bucketSum(now, 1), color: c.blue, points: bk.keys.length <= 60 },
          { label: "Visitors", data: bucketSum(now, 2), color: c.blue, dash: true, points: false },
        ] });
        viz.bar(bookHost, { labels: bk.labels, format: "count", height: 150, xTick: keepLabel, datasets: [{ label: "Bookings (GA)", data: bucketSum(bookingRows, 2), color: c.green }] });
      });

      // Channels: stacked by bucket, plus a share table.
      // channels: [date, channel, sessions, users, keyEvents]
      const chNow = channels.rows.filter((r) => inRange(r[0]));
      const chTotals = new Map();
      for (const r of chNow) { const t = chTotals.get(r[1]) || { sessions: 0, users: 0, keyEvents: 0 }; t.sessions += r[2]; t.users += r[3]; t.keyEvents += r[4]; chTotals.set(r[1], t); }
      const chList = [...chTotals.entries()].map(([channel, t]) => ({ channel, ...t })).sort((a, b) => b.sessions - a.sessions);
      const chHost = chartHost(210);
      const chBody = chList.length === 0 ? ui.empty("No traffic in this range.") : [
        h("p", { class: "chart-label", text: `Sessions per ${bk.noun} by channel` }),
        chHost,
        viz.legend(chList.map((r, i) => ({ label: r.channel, color: channelColor(r.channel, i), kind: "rect" }))),
        ui.table({
          columns: [
            { key: "channel", label: "Channel", sticky: true, strong: true, cell: (r) => h("span", { class: "src" }, h("span", { class: "dot", style: `background:${channelColor(r.channel, chList.indexOf(r))}` }), r.channel) },
            { key: "sessions", label: "Sessions", align: "r", cell: (r) => fmt.count(r.sessions) },
            { key: "share", label: "Share", align: "r", cell: (r) => ui.share(safeDiv(r.sessions, sessions) * 100, channelColor(r.channel, chList.indexOf(r))) },
            { key: "keyEvents", label: "Key events", align: "r", cell: (r) => fmt.count(r.keyEvents) },
            { key: "rate", label: "Key events / session", align: "r", cell: (r) => fmt.pct1(safeDiv(r.keyEvents, r.sessions)) },
          ],
          rows: chList,
        }),
      ];
      const channelCard = ui.card({ title: "Where visitors come from", body: chBody, bodyClass: "tight", note: "GA's default channel grouping. Organic Search is Google and Bing results, Organic Social is unpaid Instagram, TikTok and Facebook links, Direct is a typed address or an untagged link (texts, DMs, some apps). Key events per session says which channel brings people who act, not just people." });
      if (chList.length) after.push(() => {
        viz.bar(chHost, { labels: bk.labels, stacked: true, format: "count", height: 210, xTick: keepLabel, tooltipTotal: true, datasets: chList.map((r, i) => ({ label: r.channel, data: bucketSum(chNow.filter((x) => x[1] === r.channel), 2), color: channelColor(r.channel, i) })) });
      });

      // Key events in range vs the period before.
      const evRows = Object.keys(WEB_EVENT_LABELS).map((name) => ({ name, label: WEB_EVENT_LABELS[name], now: (evNow.get(name) || { count: 0, value: 0 }), before: (evBefore.get(name) || { count: 0 }) })).filter((r) => r.now.count > 0 || r.before.count > 0);
      const eventsCard = ui.card({
        title: "What visitors did", bodyClass: "flush",
        body: evRows.length === 0 ? ui.empty("No key events in this range yet. They start counting once the site has sent them, which began on the day this was set up.") : ui.table({
          columns: [
            { key: "label", label: "Event", sticky: true, strong: true, cell: (r) => r.label },
            { key: "now", label: "This range", align: "r", cell: (r) => fmt.count(r.now.count) },
            { key: "before", label: "Period before", align: "r", cell: (r) => fmt.count(r.before.count) },
            { key: "change", label: "Change", align: "r", cell: (r) => fmt.signedPct(pctChange(r.now.count, r.before.count)), cls: (r) => (r.before.count > 0 && r.now.count < r.before.count ? "neg" : "") },
            { key: "rate", label: "Per 100 sessions", align: "r", cell: (r) => (safeDiv(r.now.count, sessions) * 100).toFixed(1) },
            { key: "value", label: "Value", align: "r", cell: (r) => (r.now.value > 0 ? fmt.money0(r.now.value) : "--") },
          ],
          rows: evRows,
        }),
        note: "Events the site sends GA at the moment something happens. Value is what GA was told the action was worth: the amount paid online, or the studio fee a reservation will collect at the door.",
      });

      // Sources (monthly): source / medium.
      // sources: [month, sourceMedium, sessions, users, keyEvents]
      const srcTotals = new Map();
      for (const r of sources.rows.filter(inMonths)) { const t = srcTotals.get(r[1]) || { sessions: 0, users: 0, keyEvents: 0 }; t.sessions += r[2]; t.users += r[3]; t.keyEvents += r[4]; srcTotals.set(r[1], t); }
      const srcList = [...srcTotals.entries()].map(([source, t]) => ({ source, ...t })).sort((a, b) => b.sessions - a.sessions).slice(0, 15);
      const srcSessions = sum([...srcTotals.values()].map((t) => [t.sessions]), 0);
      const monthNote = `Monthly data covering ${[...months].map((m) => fmt.monthLong(m + "-01")).join(", ")}, so a range that starts or ends mid-month includes the whole month here.`;
      // These three tables sit in half-width cards, so each numeric column
      // stacks its detail (share, rate, visitors) under the main figure
      // instead of taking a column of its own; nothing should scroll sideways.
      const two = (main, sub) => h("span", { class: "two" }, h("span", { text: main }), h("span", { class: "sub", text: sub }));
      const sourcesCard = ui.card({
        title: "Top sources", bodyClass: "flush",
        body: srcList.length === 0 ? ui.empty("No source data in these months.") : ui.table({
          columns: [
            { key: "source", label: "Source / medium", strong: true, cls: () => "wrap", cell: (r) => r.source },
            { key: "sessions", label: "Sessions", align: "r", cell: (r) => two(fmt.count(r.sessions), fmt.pct(safeDiv(r.sessions, srcSessions)) + " share") },
            { key: "keyEvents", label: "Key events", align: "r", cell: (r) => two(fmt.count(r.keyEvents), fmt.pct1(safeDiv(r.keyEvents, r.sessions)) + " of sessions") },
          ],
          rows: srcList,
        }),
        note: `The exact site or app each visit started from. ${monthNote}`,
      });

      // Pages (monthly): [month, path, views, users, bounceRate, engagementSeconds]
      const pageTotals = new Map();
      // Staff pages (/admin/...) are Sam and the team, not visitors; keep them out of the ranking.
      for (const r of pages.rows.filter((r) => inMonths(r) && !String(r[1]).startsWith("/admin"))) { const t = pageTotals.get(r[1]) || { views: 0, users: 0, bounceWeighted: 0, seconds: 0 }; t.views += r[2]; t.users += r[3]; t.bounceWeighted += r[4] * r[2]; t.seconds += r[5]; pageTotals.set(r[1], t); }
      const pageList = [...pageTotals.entries()].map(([path, t]) => ({ path, ...t, bounce: safeDiv(t.bounceWeighted, t.views), perUser: safeDiv(t.seconds, t.users) })).sort((a, b) => b.views - a.views).slice(0, 15);
      const pagesCard = ui.card({
        title: "Most viewed pages", bodyClass: "flush",
        body: pageList.length === 0 ? ui.empty("No page data in these months.") : ui.table({
          columns: [
            { key: "path", label: "Page", strong: true, cls: () => "wrap", cell: (r) => r.path },
            { key: "views", label: "Views", align: "r", cell: (r) => two(fmt.count(r.views), fmt.count(r.users) + " visitors") },
            { key: "bounce", label: "Bounce", align: "r", cell: (r) => fmt.pct(r.bounce), cls: (r) => (r.views >= 50 && r.bounce >= 0.6 ? "neg" : "") },
            { key: "time", label: "Time", align: "r", cell: (r) => two(`${Math.round(r.perUser)}s`, "per visitor") },
          ],
          rows: pageList,
        }),
        note: `Bounce is the share of visits that left without engaging; high on a page people arrive at is normal, high on a page they chose to open is worth a look. ${monthNote}`,
      });

      // Cities and devices (monthly). Phones on cellular data leave the carrier's network
      // through gateways that GA places in Phoenix, Denver, Englewood CO or Tempe, so a Utah
      // visitor on a phone often shows up there (they engage exactly like Orem visitors and
      // are ~90% mobile, checked 2026-10-27). Those rows fold into one labelled bucket.
      const cityTotals = new Map();
      for (const r of cities.rows.filter(inMonths)) { const key = r[1] === "(not set)" ? "Unknown" : isCarrierGateway(r[1], r[2]) ? CARRIER_LABEL : `${r[1]}, ${r[2]}`; const t = cityTotals.get(key) || { sessions: 0, keyEvents: 0 }; t.sessions += r[3]; t.keyEvents += r[5]; cityTotals.set(key, t); }
      const cityList = [...cityTotals.entries()].map(([city, t]) => ({ city, ...t })).sort((a, b) => b.sessions - a.sessions).slice(0, 12);
      const citySessions = [...cityTotals.values()].reduce((s, t) => s + t.sessions, 0);
      const citiesCard = ui.card({
        title: "Where visitors are", bodyClass: "flush",
        body: cityList.length === 0 ? ui.empty("No location data in these months.") : ui.table({
          columns: [
            { key: "city", label: "City", strong: true, cls: () => "wrap", cell: (r) => r.city },
            { key: "sessions", label: "Sessions", align: "r", cell: (r) => two(fmt.count(r.sessions), fmt.pct(safeDiv(r.sessions, citySessions)) + " share") },
            { key: "keyEvents", label: "Key events", align: "r", cell: (r) => fmt.count(r.keyEvents) },
          ],
          rows: cityList,
        }),
        note: `GA's best guess from the network. "${CARRIER_LABEL}" groups Phoenix, Denver, Englewood CO and Tempe, where the big mobile carriers' gateways sit: a Utah phone on cellular data is placed there, and those visits engage exactly like Orem's. Most of them are local. A Provo visitor on wifi can also show as Orem. ${monthNote}`,
      });
      const devTotals = new Map();
      for (const r of devices.rows.filter(inMonths)) devTotals.set(r[1], (devTotals.get(r[1]) || 0) + r[2]);
      const devList = [...devTotals.entries()].sort((a, b) => b[1] - a[1]);
      const devHost = chartHost(190);
      const devicesCard = ui.card({ title: "Phones vs. desktops", bodyClass: "tight", body: devList.length === 0 ? ui.empty("No device data.") : [devHost, viz.legend(devList.map(([d], i) => ({ label: d, color: [c.brown, c.green, c.blue][i] || c.other, kind: "rect" })))], note: "Sessions by device. The booking flow should be checked on whatever this says most people use." });
      if (devList.length) after.push(() => viz.donut(devHost, { labels: devList.map(([d]) => d), data: devList.map(([, n]) => n), colors: devList.map((_, i) => [c.brown, c.green, c.blue][i] || c.other), format: "count" }));

      return [
        kpis,
        trafficCard,
        channelCard,
        eventsCard,
        h("div", { class: "grid-2" }, sourcesCard, pagesCard),
        h("div", { class: "grid-2" }, citiesCard, devicesCard),
        h("p", { class: "closing", text: `Google Analytics property ${meta.propertyId}, data through ${fmt.dateLong(meta.to)}. GA reports the previous day in full the next morning, so today and yesterday can still fill in.` }),
      ];
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  const renderers = { bookings: renderBookings, marketing: renderMarketing, website: renderWebsite, sales: renderSales };
  function renderCurrent() { if (!state.shell) return; const id = state.shell.currentTab(); renderers[id] && renderers[id](); }

  // reports.html mounts one shell for every group and hands it over here.
  // renderCurrent is a no-op when the shell's current tab belongs to another module.
  S.modules = S.modules || {};
  S.modules.operations = {
    id: "operations", label: "Customers", defaultGroup: "customers",
    tabs: [{ id: "bookings", label: "Bookings & Capacity" }, { id: "marketing", label: "Marketing" }, { id: "website", label: "Website" }, { id: "sales", label: "Sales & Products", group: "sales" }],
    rangedTabs: ["bookings", "marketing", "website", "sales"],
    locationTabs: ["bookings", "marketing"],
    start(sh) {
      state.shell = sh;
      state.query = range.toQuery(sh.state.range);
      state.location = sh.state.location;
      viz.onThemeChange(() => renderCurrent());
      loadBookings();
    },
    refresh() { cache.clear(); },
    onTab() { renderCurrent(); },
    onRange(r) { state.query = range.toQuery(r); renderCurrent(); },
    onLocation(loc) { state.location = loc; renderCurrent(); },
  };
})();
