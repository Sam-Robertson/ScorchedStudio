/* Scorched Studio reporting dashboards: shared runtime.
 *
 * Exposes window.Scorched = { api, auth, fmt, dates, range, ui, viz, journal, shell }.
 * Requires Chart.js 4 (UMD, global `Chart`) to be loaded before this file.
 *
 * Data comes live from the studio's own admin API (the same routes the old
 * in-app Reporting pages used), authenticated with the signed admin session
 * token the dashboard obtains from /api/admin/verify. The token and the API
 * base address are kept in this page's own localStorage (each artifact has
 * its own origin, so nothing leaks between pages).
 */
(function () {
  "use strict";

  const DEFAULT_API = "https://www.scorchedstudio.com";
  const ONLINE_BOOKING_LAUNCH = "2026-03-24"; // bookings table has no rows before this
  const DATA_STARTS_AT = "2025-06-06";        // first ledger activity

  // ── storage (per-viewer convenience; may be unavailable) ────────────────
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ── API client ──────────────────────────────────────────────────────────
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  const api = {
    DEFAULT_API,
    base() { return (store.get("apiBase") || DEFAULT_API).replace(/\/+$/, ""); },
    setBase(v) { const b = (v || "").trim().replace(/\/+$/, ""); if (!b || b === DEFAULT_API) store.del("apiBase"); else store.set("apiBase", b); },
    token() { return store.get("adminToken"); },
    async request(method, path, body) {
      const headers = {};
      const t = this.token();
      if (t) headers.Authorization = "Bearer " + t;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      let res;
      try {
        res = await fetch(this.base() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch {
        throw new ApiError(0, "Could not reach " + this.base() + ". Check your connection, or the API address under Sign-in settings.");
      }
      let json = null;
      try { json = await res.json(); } catch { /* non-JSON body */ }
      if (res.status === 401 && path !== "/api/admin/verify") {
        auth.expire("Your session has expired. Sign in again.");
        throw new ApiError(401, "Session expired");
      }
      if (!res.ok || (json && json.error)) {
        throw new ApiError(res.status, (json && json.error) || res.statusText || "Request failed");
      }
      return json;
    },
    get(path) { return this.request("GET", path); },
    post(path, body) { return this.request("POST", path, body); },
  };

  // ── auth / sign-in screen ───────────────────────────────────────────────
  const auth = {
    _onReady: null,
    _title: "",
    _session: null,
    /** Call once on load. `onReady(session)` fires after every successful sign-in. */
    async start({ title, onReady }) {
      this._title = title;
      this._onReady = onReady;
      this._ensureLoginDom();
      if (!api.token()) { this._showLogin(); return; }
      this._showLogin(false, "Checking your session");
      try {
        const s = await api.get("/api/admin/session");
        if (s.role !== "admin") { this.expire("This dashboard needs the admin password, not a location password."); return; }
        this._ready(s);
      } catch (e) {
        if (e.status === 401) return; // expire() already drew the form
        this._showLogin(true, null, e.message);
      }
    },
    session() { return this._session; },
    expire(msg) { store.del("adminToken"); this._session = null; this._showLogin(true, null, msg); },
    signOut() { store.del("adminToken"); this._session = null; location.reload(); },
    _ready(session) {
      this._session = session;
      const login = document.getElementById("login"), app = document.getElementById("app");
      if (login) login.hidden = true;
      if (app) app.hidden = false;
      this._onReady && this._onReady(session);
    },
    _ensureLoginDom() {
      let login = document.getElementById("login");
      if (!login) { login = document.createElement("div"); login.id = "login"; document.body.prepend(login); }
    },
    _showLogin(form = true, waiting = null, error = null) {
      const login = document.getElementById("login"), app = document.getElementById("app");
      if (app) app.hidden = true;
      login.hidden = false;
      login.className = "login";
      ui.clear(login);
      const card = ui.h("div", { class: "login-card" });
      card.append(
        ui.h("p", { class: "brand-eyebrow", text: "Scorched Studio" }),
        ui.h("h1", { text: this._title }),
      );
      if (!form) {
        card.append(ui.h("div", { class: "state", style: { padding: "8px 0" } }, ui.h("span", { class: "spinner" }), waiting || "Loading"));
        login.append(card);
        return;
      }
      card.append(ui.h("p", { text: "Sign in with the studio admin password. This device stays signed in until you sign out." }));
      const err = ui.h("div", { class: "error-box", hidden: !error, text: error || "" });
      const pw = ui.h("input", { class: "field", type: "password", id: "login-password", autocomplete: "current-password", placeholder: "Admin password", required: true });
      const btn = ui.h("button", { class: "btn primary", type: "submit", text: "Sign in" });
      const adv = ui.h("details", {},
        ui.h("summary", { text: "Sign-in settings" }),
        ui.h("label", { class: "lbl", for: "login-api", text: "API address" }),
        ui.h("input", { class: "field", type: "url", id: "login-api", value: api.base(), placeholder: DEFAULT_API }),
      );
      const f = ui.h("form", { id: "login-form" }, err, pw, btn, adv);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        err.hidden = true;
        api.setBase(adv.querySelector("#login-api").value);
        btn.disabled = true; btn.textContent = "Signing in";
        try {
          const r = await api.post("/api/admin/verify", { password: pw.value });
          if (r.role !== "admin") throw new ApiError(403, "That is a location password. This dashboard needs the admin password.");
          store.set("adminToken", r.token);
          this._ready({ role: r.role, location: r.location });
        } catch (e) {
          err.textContent = e.status === 401 ? "That password did not match." : e.message;
          err.hidden = false;
          btn.disabled = false; btn.textContent = "Sign in";
        }
      });
      card.append(f);
      login.append(card);
      setTimeout(() => pw.focus(), 0);
    },
  };

  // ── formatting ──────────────────────────────────────────────────────────
  const fmt = {
    money0: (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
    money2: (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
    moneyOrDash: (n) => (n == null ? "--" : fmt.money2(n)),
    money0OrDash: (n) => (n == null ? "--" : fmt.money0(n)),
    axisMoney(n) {
      if (n === 0) return "$0";
      const sign = n < 0 ? "-" : "", abs = Math.abs(n);
      if (abs >= 1000) { const k = abs / 1000; return sign + "$" + (Number.isInteger(k) ? k : k.toFixed(1)) + "K"; }
      return sign + "$" + Math.round(abs);
    },
    count: (n) => Math.round(Number(n || 0)).toLocaleString("en-US"),
    axisCount: (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(Number.isInteger(n / 1000) ? 0 : 1) + "K" : String(n)),
    pct: (rate) => Math.round((rate || 0) * 100) + "%",
    pct1: (rate) => ((rate || 0) * 100).toFixed(1) + "%",
    cents: (c) => "$" + Math.round((c || 0) / 100).toLocaleString("en-US"),
    /** "2026-01-01" -> "Jan 26" */
    monthShort: (pm) => new Date(pm.slice(0, 10).slice(0, 7) + "-01T12:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    /** "2026-01-01" -> "Jan" (chart ticks only) */
    monthTick: (pm) => (/^\d{4}-\d{2}/.test(pm) ? new Date(pm.slice(0, 7) + "-01T12:00:00").toLocaleDateString("en-US", { month: "short" }) : String(pm).split(" ")[0]),
    /** "2026-01-01" -> "Jan 2026" */
    monthLong: (pm) => new Date(pm.slice(0, 7) + "-01T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    /** "2025-08-02" -> "Aug 2" */
    dateShort: (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    /** "2025-08-02" -> "Aug 2, 2025" */
    dateLong: (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    signedPct: (p) => (p == null ? "--" : (p >= 0 ? "+" : "") + p + "%"),
  };

  // ── dates ───────────────────────────────────────────────────────────────
  const STUDIO_TZ = "America/Denver";
  const dates = {
    ONLINE_BOOKING_LAUNCH, DATA_STARTS_AT,
    toDateStr: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    todayStr() { return dates.toDateStr(new Date()); },
    addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; },
    shiftDate(ymd, n) { return dates.toDateStr(dates.addDays(new Date(ymd + "T12:00:00"), n)); },
    monthsBackStart(n) { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - n, 1); return dates.toDateStr(s); },
    /** Every "YYYY-MM" from start through end inclusive. */
    monthsBetween(startISO, endISO) {
      const [sy, sm] = startISO.slice(0, 7).split("-").map(Number);
      const [ey, em] = endISO.slice(0, 7).split("-").map(Number);
      const out = []; let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m += 1; if (m > 12) { m = 1; y += 1; } }
      return out;
    },
    /** Which Denver calendar date a UTC instant falls on. */
    denverDateKey(iso) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
      const get = (t) => parts.find((p) => p.type === t).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    },
    todayDenverYmd() { return dates.denverDateKey(new Date().toISOString()); },
    /** Day-of-week index (0 = Sunday) for a YYYY-MM-DD string. */
    dowIndex: (d) => new Date(d + "T12:00:00Z").getUTCDay(),
    /** "2026-02" or "2026-02-01" -> "2026-02-28" */
    monthEnd(key) { const [y, m] = key.slice(0, 7).split("-").map(Number); const last = new Date(y, m, 0).getDate(); return `${key.slice(0, 7)}-${String(last).padStart(2, "0")}`; },
    DOW_NAMES: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  };

  // ── date-range filter (shared by every ranged tab) ──────────────────────
  const PRESETS = [["3m", "3M"], ["6m", "6M"], ["ytd", "YTD"], ["all", "All"], ["custom", "Custom"]];
  const range = {
    /** Query-string fragment ("start=...&end=..." or "") for the selected range. */
    toQuery(r) {
      if (r.preset === "all") return "";
      if (r.preset === "custom") { const p = []; if (r.start) p.push("start=" + r.start); if (r.end) p.push("end=" + r.end); return p.join("&"); }
      const start = r.preset === "ytd" ? `${new Date().getFullYear()}-01-01` : r.preset === "6m" ? dates.monthsBackStart(5) : dates.monthsBackStart(2);
      return `start=${start}&end=${dates.todayStr()}`;
    },
    bounds(query) { const p = new URLSearchParams(query); return { start: p.get("start") || undefined, end: p.get("end") || undefined }; },
    /** Renders the preset row + custom inputs into `host`. Returns { set(value) }. */
    mount(host, { value, onChange }) {
      let cur = { ...value };
      const seg = ui.h("div", { class: "seg", role: "group", "aria-label": "Date range" });
      const custom = ui.h("div", { class: "filters-left", hidden: cur.preset !== "custom" });
      const start = ui.h("input", { class: "field", type: "date", id: "range-start", "aria-label": "Start date" });
      const end = ui.h("input", { class: "field", type: "date", id: "range-end", "aria-label": "End date" });
      custom.append(start, ui.h("span", { class: "lbl", text: "to" }), end);
      const buttons = {};
      for (const [p, label] of PRESETS) {
        const b = ui.h("button", { type: "button", text: label, "aria-pressed": String(cur.preset === p) });
        b.addEventListener("click", () => set({ preset: p, start: cur.start, end: cur.end }, true));
        buttons[p] = b; seg.append(b);
      }
      const emit = () => onChange({ ...cur });
      start.addEventListener("change", () => { cur.start = start.value || undefined; emit(); });
      end.addEventListener("change", () => { cur.end = end.value || undefined; emit(); });
      function set(v, fire) {
        cur = { ...v };
        for (const p in buttons) buttons[p].setAttribute("aria-pressed", String(cur.preset === p));
        custom.hidden = cur.preset !== "custom";
        start.value = cur.start || ""; end.value = cur.end || "";
        if (fire) emit();
      }
      host.append(seg, custom);
      set(cur, false);
      return { set: (v) => set(v, false), get: () => ({ ...cur }) };
    },
  };

  // ── DOM helpers / UI components ─────────────────────────────────────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "hidden") el.hidden = !!v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  const ui = {
    h,
    clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; },
    replace(el, ...children) { ui.clear(el); el.append(...children.flat().filter(Boolean)); return el; },
    /** Stat tile. tone/subTone: "good" | "bad" | undefined. onClick makes it a toggle button. */
    kpi({ label, value, sub, tone, subTone, onClick, selected }) {
      const inner = [
        h("p", { class: "kpi-label", text: label }),
        h("p", { class: "kpi-value" + (tone ? " " + tone : ""), text: value }),
        sub ? h("p", { class: "kpi-sub" + (subTone ? " " + subTone : ""), text: sub }) : null,
      ];
      if (onClick) return h("button", { class: "kpi", type: "button", "aria-pressed": String(!!selected), onClick }, inner);
      return h("div", { class: "kpi" }, inner);
    },
    kpis(cols, tiles) { return h("div", { class: "kpis c" + cols }, tiles); },
    /** Card with a mono title, optional right-side action, body node(s) and footnote. */
    card({ title, action, body, note, bodyClass }) {
      const el = h("div", { class: "card" });
      if (title || action) el.append(h("div", { class: "card-head" }, title ? h("p", { class: "card-title", text: title }) : h("span"), action || null));
      const b = h("div", { class: "card-body" + (bodyClass ? " " + bodyClass : "") }, body);
      el.append(b);
      if (note) el.append(h("p", { class: "note", text: note }));
      el.body = b;
      return el;
    },
    loading(text) { return h("div", { class: "state" }, h("span", { class: "spinner" }), text || "Loading"); },
    error(msg) { return h("div", { class: "error-box", text: msg }); },
    empty(msg) { return h("div", { class: "state", text: msg }); },
    note(text) { return h("p", { class: "note", text }); },
    /** Segmented toggle: options [{value,label}], returns element with .set(value). */
    seg(options, value, onChange, label) {
      const el = h("div", { class: "seg", role: "group", "aria-label": label || "" });
      const btns = options.map((o) => {
        const b = h("button", { type: "button", text: o.label, "aria-pressed": String(o.value === value) });
        b.addEventListener("click", () => { el.set(o.value); onChange(o.value); });
        return b;
      });
      el.append(...btns);
      el.set = (v) => btns.forEach((b, i) => b.setAttribute("aria-pressed", String(options[i].value === v)));
      return el;
    },
    /**
     * Sortable table. columns: [{ key, label, align: "r"?, sortable?, sticky?, strong?, cell(row) -> node|string, cls(row) -> string }]
     * sort: { col, dir } with onSort(col). total: array of cell nodes/strings (one per column) or null.
     * Returns a .tbl-wrap element.
     */
    table({ columns, rows, sort, onSort, total, rowKey, afterRow }) {
      const thead = h("tr");
      for (const c of columns) {
        const th = h("th", { class: [c.align === "r" ? "r" : "", c.sortable ? "sortable" : "", c.sticky ? "sticky" : "", sort && sort.col === c.key ? "sorted" : ""].join(" ").trim(), scope: "col" });
        th.textContent = c.label + (sort && sort.col === c.key ? (sort.dir === "desc" ? " \u2193" : " \u2191") : "");
        if (c.sortable && onSort) { th.addEventListener("click", () => onSort(c.key)); th.setAttribute("aria-sort", sort && sort.col === c.key ? (sort.dir === "desc" ? "descending" : "ascending") : "none"); }
        thead.append(th);
      }
      const tbody = h("tbody");
      rows.forEach((r, i) => {
        const tr = h("tr", { dataset: rowKey ? { key: String(rowKey(r)) } : undefined });
        for (const c of columns) {
          const v = c.cell ? c.cell(r, i) : r[c.key];
          const td = h("td", { class: [c.align === "r" ? "r" : "", c.sticky ? "sticky" : "", c.strong ? "strong" : "", c.cls ? c.cls(r) : ""].join(" ").trim() });
          if (v != null) td.append(v.nodeType ? v : document.createTextNode(String(v)));
          tr.append(td);
        }
        tbody.append(tr);
        if (afterRow) { const extra = afterRow(r, i); if (extra) tbody.append(extra); }
      });
      if (total) {
        const tr = h("tr", { class: "total" });
        columns.forEach((c, i) => {
          const v = total[i];
          const td = h("td", { class: [c.align === "r" ? "r" : "", c.sticky ? "sticky" : ""].join(" ").trim() });
          if (v != null) td.append(v.nodeType ? v : document.createTextNode(String(v)));
          tr.append(td);
        });
        tbody.append(tr);
      }
      return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, thead), tbody));
    },
    /** Inline progress bar + percent label, for share columns. color optional. */
    share(pct, color) {
      return h("span", {}, h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: { width: Math.min(100, Math.max(0, pct)) + "%", background: color || "" } })), h("span", { class: "num", text: Math.round(pct) + "%" }));
    },
    /** Toggle sort state: same column flips direction, new column starts at `firstDir`. */
    nextSort(sort, col, firstDir) {
      if (sort.col === col) return { col, dir: sort.dir === "desc" ? "asc" : "desc" };
      return { col, dir: firstDir || "desc" };
    },
    sortRows(rows, sort, getters) {
      const get = getters[sort.col] || ((r) => r[sort.col]);
      const out = [...rows];
      out.sort((a, b) => {
        const av = get(a), bv = get(b);
        const cmp = typeof av === "string" ? av.localeCompare(bv) : (av ?? -Infinity) - (bv ?? -Infinity);
        return sort.dir === "desc" ? -cmp : cmp;
      });
      return out;
    },
  };

  // ── charts (Chart.js 4) ─────────────────────────────────────────────────
  const viz = {
    css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
    series(i) { return viz.css("--series-" + (i + 1)) || viz.css("--series-other"); },
    palette() { return Array.from({ length: 9 }, (_, i) => viz.series(i)); },
    colors() {
      return {
        surface: viz.css("--surface"), ink: viz.css("--ink"), ink2: viz.css("--ink-2"), ink3: viz.css("--ink-3"),
        grid: viz.css("--grid"), line: viz.css("--line"), accent: viz.css("--accent"), accentInk: viz.css("--accent-ink"),
        good: viz.css("--good"), bad: viz.css("--bad"), other: viz.css("--series-other"),
        brown: viz.css("--series-1"), green: viz.css("--series-2"), blue: viz.css("--series-3"), greenSoft: viz.css("--series-2-soft"),
      };
    },
    withAlpha(hex, a) {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
      if (!m) return hex;
      return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
    },
    _charts: new Map(),
    _themeFns: [],
    /** Register a function to re-run when the theme flips (charts read colors at build time). */
    onThemeChange(fn) { viz._themeFns.push(fn); },
    _applyDefaults() {
      if (typeof Chart === "undefined") return;
      const c = viz.colors();
      const mono = viz.css("--font-mono") || "monospace";
      Chart.defaults.font.family = mono;
      Chart.defaults.font.size = 11;
      Chart.defaults.color = c.ink3;
      Chart.defaults.borderColor = c.grid;
      // Set the duration only: replacing the whole animation descriptor drops the
      // per-property interpolators and the animator dies on the first doughnut.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) Chart.defaults.animation = false;
      else if (Chart.defaults.animation) Chart.defaults.animation.duration = 300;
      Chart.defaults.plugins.legend.display = false;
      const t = Chart.defaults.plugins.tooltip;
      t.backgroundColor = c.surface; t.titleColor = c.ink; t.bodyColor = c.ink2; t.borderColor = c.line; t.borderWidth = 1;
      t.cornerRadius = 8; t.padding = 10; t.usePointStyle = true; t.boxWidth = 8; t.boxHeight = 8; t.boxPadding = 4;
      t.titleFont = { family: mono, weight: "bold", size: 12 }; t.bodyFont = { family: mono, size: 12 };
    },
    _fmtFor(format) {
      if (typeof format === "function") return format;
      if (format === "count") return (v) => fmt.count(v);
      if (format === "money2") return (v) => fmt.money2(v);
      if (format === "pct") return (v) => fmt.pct1(v);
      return (v) => fmt.money0(v);
    },
    _axisFmtFor(format) {
      if (typeof format === "function") return format;
      if (format === "count") return (v) => fmt.axisCount(v);
      if (format === "pct") return (v) => Math.round(v * 100) + "%";
      return (v) => fmt.axisMoney(v);
    },
    _tooltip(format, { total } = {}) {
      const f = viz._fmtFor(format);
      return {
        callbacks: {
          title: (items) => (items[0] ? String(items[0].label) : ""),
          label: (item) => {
            const v = item.parsed[item.chart.config.options.indexAxis === "y" ? "x" : "y"];
            if (v == null) return null;
            return " " + f(v) + "  " + item.dataset.label;
          },
          footer: total ? (items) => { const s = items.reduce((a, i) => a + (i.parsed.y || 0), 0); return items.length > 1 ? "Total " + f(s) : ""; } : undefined,
        },
        itemSort: (a, b) => (b.parsed.y || 0) - (a.parsed.y || 0),
        filter: (item) => item.parsed.y !== 0 || item.parsed.x !== 0,
      };
    },
    /** Ensure a sized canvas lives inside host; destroy any previous chart there. */
    _canvas(host, height) {
      host.classList.add("chart");
      host.style.height = (height || 260) + "px";
      let cv = host.querySelector("canvas");
      if (!cv) { cv = document.createElement("canvas"); host.append(cv); }
      const prev = viz._charts.get(host);
      if (prev) { prev.destroy(); viz._charts.delete(host); }
      return cv;
    },
    _make(host, config, height) {
      viz._applyDefaults();
      const cv = viz._canvas(host, height);
      config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options);
      const chart = new Chart(cv, config);
      viz._charts.set(host, chart);
      return chart;
    },
    _scales({ format, horizontal, stacked, hideY, xTick, yMax, yMin }) {
      const c = viz.colors();
      const vAxis = { stacked: !!stacked, beginAtZero: true, grid: { color: c.grid, drawTicks: false }, border: { display: false, dash: [] }, ticks: { callback: (v) => viz._axisFmtFor(format)(v), padding: 8, maxTicksLimit: 6, precision: format === "count" ? 0 : undefined }, display: !hideY };
      if (yMax != null) vAxis.max = yMax;
      if (yMin != null) vAxis.min = yMin;
      const cTicks = { padding: 6, autoSkip: true, maxRotation: 0 };
      // Only set a callback when the caller passes one: an explicit `undefined`
      // replaces Chart.js's default and the axis then prints indices.
      if (xTick) cTicks.callback = function (v, i) { return xTick(this.getLabelForValue(v), i); };
      const cAxis = { stacked: !!stacked, grid: { display: false }, border: { display: false }, ticks: cTicks };
      return horizontal ? { x: vAxis, y: cAxis } : { x: cAxis, y: vAxis };
    },
    /**
     * Bar chart. datasets: [{ label, data, color (string or array), stack?, hidden?, order? }].
     * Options: stacked, horizontal, format ("money" | "count" | fn), height, onClick(index, datasetIndex),
     * tooltipTotal, barThickness, xTick(label) tick formatter, dim(index, dsIndex) -> boolean (render at low opacity).
     */
    bar(host, o) {
      const c = viz.colors();
      const n = o.datasets.length;
      const datasets = o.datasets.map((d, di) => {
        const color = (ctx) => {
          const base = Array.isArray(d.color) ? d.color[ctx.dataIndex] : (d.color || viz.series(di));
          return o.dim && o.dim(ctx.dataIndex, di) ? viz.withAlpha(base, 0.2) : base;
        };
        const last = !o.stacked || di === n - 1;
        return {
          label: d.label, data: d.data, backgroundColor: color, hoverBackgroundColor: color,
          borderColor: c.surface, borderWidth: o.stacked ? 1 : 0, borderSkipped: "start",
          borderRadius: last ? 4 : 0, maxBarThickness: o.barThickness || 24, categoryPercentage: 0.7, barPercentage: 0.9,
          stack: o.stacked ? (d.stack || "a") : undefined, hidden: !!d.hidden, order: d.order,
        };
      });
      return viz._make(host, {
        type: "bar",
        data: { labels: o.labels, datasets },
        options: {
          indexAxis: o.horizontal ? "y" : "x",
          interaction: { mode: "index", axis: o.horizontal ? "y" : "x", intersect: false },
          scales: viz._scales(o),
          plugins: { tooltip: viz._tooltip(o.format, { total: o.tooltipTotal }) },
          onHover: (ev, els) => { ev.native.target.style.cursor = o.onClick && els.length ? "pointer" : "default"; },
          onClick: (ev, els) => { if (o.onClick && els.length) o.onClick(els[0].index, els[0].datasetIndex); },
        },
      }, o.height);
    },
    /**
     * Line / area chart. datasets: [{ label, data, color, dash?, area?, points? (default true), spanGaps? }].
     * Options: format, height, onClick(index), xTick, refLines: [{ value, label, color, dash }].
     */
    line(host, o) {
      const c = viz.colors();
      const datasets = o.datasets.map((d, di) => {
        const color = d.color || viz.series(di);
        const points = d.points !== false;
        return {
          label: d.label, data: d.data, borderColor: color, borderWidth: 2, borderDash: d.dash ? [5, 4] : undefined,
          backgroundColor: d.area ? viz.withAlpha(color, 0.12) : color, fill: !!d.area, tension: 0.3,
          pointRadius: points ? 4 : 0, pointHoverRadius: 6, pointBackgroundColor: color, pointBorderColor: c.surface, pointBorderWidth: 2,
          pointHitRadius: 12, spanGaps: !!d.spanGaps, hidden: !!d.hidden,
        };
      });
      const refPlugin = {
        id: "refLines",
        afterDatasetsDraw(chart) {
          if (!o.refLines) return;
          const { ctx, chartArea: a, scales } = chart;
          for (const r of o.refLines) {
            const y = scales.y.getPixelForValue(r.value);
            if (y < a.top || y > a.bottom) continue;
            ctx.save(); ctx.strokeStyle = r.color || c.ink3; ctx.lineWidth = 1.5; ctx.setLineDash(r.dash || [4, 4]);
            ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
            if (r.label) { ctx.setLineDash([]); ctx.fillStyle = r.color || c.ink3; ctx.font = "10px " + (viz.css("--font-mono") || "monospace"); ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(r.label, a.right, y - 3); }
            ctx.restore();
          }
        },
      };
      return viz._make(host, {
        type: "line",
        data: { labels: o.labels, datasets },
        options: {
          interaction: { mode: "index", intersect: false },
          scales: viz._scales(o),
          plugins: { tooltip: viz._tooltip(o.format) },
          onHover: (ev, els) => { ev.native.target.style.cursor = o.onClick && els.length ? "pointer" : "default"; },
          onClick: (ev, els) => { if (o.onClick && els.length) o.onClick(els[0].index); },
        },
        plugins: [refPlugin],
      }, o.height);
    },
    /** Bars plus a line on the SAME axis (e.g. seats per day + 7-day average). */
    mixed(host, o) {
      const c = viz.colors();
      const bars = o.bars.map((d, di) => ({
        type: "bar", label: d.label, data: d.data, backgroundColor: d.color || viz.series(di + 1), borderRadius: 4, borderSkipped: "start",
        maxBarThickness: o.barThickness || 24, categoryPercentage: 0.8, barPercentage: 0.9, order: 2,
      }));
      const lines = o.lines.map((d, di) => ({
        type: "line", label: d.label, data: d.data, borderColor: d.color || viz.series(di), borderWidth: 2, tension: 0.3,
        pointRadius: d.points ? 4 : 0, pointHoverRadius: 5, pointBackgroundColor: d.color || viz.series(di), pointBorderColor: c.surface, pointBorderWidth: 2, order: 1,
      }));
      return viz._make(host, {
        type: "bar",
        data: { labels: o.labels, datasets: [...lines, ...bars] },
        options: {
          interaction: { mode: "index", intersect: false },
          scales: viz._scales(o),
          plugins: { tooltip: viz._tooltip(o.format) },
        },
      }, o.height);
    },
    /** Donut. labels, data, colors (array), format, onClick(index), dim(index) -> boolean. */
    donut(host, o) {
      const c = viz.colors();
      const f = viz._fmtFor(o.format);
      return viz._make(host, {
        type: "doughnut",
        data: { labels: o.labels, datasets: [{ data: o.data, backgroundColor: (ctx) => (o.dim && o.dim(ctx.dataIndex) ? viz.withAlpha(o.colors[ctx.dataIndex], 0.25) : o.colors[ctx.dataIndex]), borderColor: c.surface, borderWidth: 2, hoverOffset: 6 }] },
        options: {
          cutout: "62%",
          plugins: { tooltip: { callbacks: { label: (item) => " " + f(item.parsed) + "  " + item.label } } },
          onHover: (ev, els) => { ev.native.target.style.cursor = o.onClick && els.length ? "pointer" : "default"; },
          onClick: (ev, els) => { if (o.onClick && els.length) o.onClick(els[0].index); },
        },
      }, o.height);
    },
    /** HTML legend. items: [{ label, color, kind: "rect" | "line" | "dash", pressed? }]. onToggle(label) makes items buttons. */
    legend(items, onToggle) {
      const el = h("div", { class: "legend" });
      for (const it of items) {
        const key = h("span", { class: it.kind === "rect" || !it.kind ? "sw" : "ln" + (it.kind === "dash" ? " dash" : ""), style: it.kind === "dash" ? { color: it.color } : { background: it.color } });
        const node = onToggle
          ? h("button", { class: "legend-item", type: "button", "aria-pressed": String(it.pressed !== false), onClick: () => onToggle(it.label) }, key, it.label)
          : h("span", { class: "legend-item" }, key, it.label);
        el.append(node);
      }
      return el;
    },
  };
  // theme flips: rerun registered renderers (charts bake colors in at build time)
  (function watchTheme() {
    const fire = () => { for (const fn of viz._themeFns) { try { fn(); } catch (e) { console.error(e); } } };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener && mq.addEventListener("change", fire);
    new MutationObserver(fire).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  })();

  // ── journal-entry drill-down (transactions behind an account over a window) ──
  const journal = {
    /** Renders a transactions table into `host` for the given account codes and window. */
    async mount(host, { from, to, accountCodes }) {
      ui.replace(host, ui.loading("Loading transactions"));
      const parts = ["accountCode=" + encodeURIComponent(accountCodes.join(",")), "limit=500"];
      if (from) parts.push("from=" + from);
      if (to) parts.push("to=" + to);
      let entries;
      try { entries = (await api.get("/api/admin/accounting/journal-entries?" + parts.join("&"))).entries || []; }
      catch (e) { if (e.status !== 401) ui.replace(host, ui.error(e.message)); return; }
      const codeSet = new Set(accountCodes);
      const rows = entries.map((e) => {
        const matching = (e.journal_lines || []).filter((l) => l.accounts && codeSet.has(l.accounts.code));
        // Ledger lines are debit-positive, so revenue is stored negative; flip it so a revenue cell drills to positives.
        const amount = matching.reduce((s, l) => s + (l.accounts.type === "revenue" ? -Number(l.amount) : Number(l.amount)), 0);
        const accountNames = [...new Set(matching.map((l) => l.accounts.name))];
        const lineMemo = matching.map((l) => l.memo).find((m) => m) || null;
        return { id: e.id, date: e.entry_date, memo: e.memo || lineMemo, amount, accountNames };
      });
      if (!rows.length) { ui.replace(host, ui.empty("No transactions found for this window.")); return; }
      const showAccount = accountCodes.length > 1;
      const total = rows.reduce((s, r) => s + r.amount, 0);
      const columns = [
        { key: "date", label: "Date", cell: (r) => fmt.dateLong(r.date) },
        ...(showAccount ? [{ key: "acct", label: "Account", cell: (r) => r.accountNames.join(", ") }] : []),
        { key: "memo", label: "Memo", cell: (r) => r.memo || "--" },
        { key: "amount", label: "Amount", align: "r", cell: (r) => fmt.money0(r.amount) },
      ];
      const totalCells = showAccount ? [`Total (${rows.length} entries)`, "", "", fmt.money0(total)] : [`Total (${rows.length} entries)`, "", fmt.money0(total)];
      const tbl = ui.table({ columns, rows, total: totalCells });
      ui.replace(host, tbl, rows.length >= 500 ? ui.note("Showing the 500 most recent entries. Narrow the date range to see everything.") : null);
    },
  };

  // ── page shell: top bar, tabs, filter row, one container per view ───────
  const shell = {
    /**
     * tabs: [{ id, label, quiet? }]; rangedTabs / locationTabs: ids that show those filters.
     * onTab(id), onRange(rangeState), onLocation("all"|"orem"|"slc"). Returns { views, setTab, range, location }.
     */
    mount(root, { title, tabs, rangedTabs = [], locationTabs = [], initialRange, onTab, onRange, onLocation }) {
      ui.clear(root);
      const tabList = h("div", { class: "tabs", role: "tablist" });
      const views = {};
      const page = h("main", { class: "page" });
      const filters = h("div", { class: "filters" });
      const fLeft = h("div", { class: "filters-left" });
      const fRight = h("div", { class: "filters-right" });
      filters.append(fLeft, fRight);
      let current = null;
      const state = { range: initialRange || { preset: "3m" }, location: "all" };

      const rangeHost = h("div", { class: "filters-left" });
      const rangeCtl = range.mount(rangeHost, { value: state.range, onChange: (r) => { state.range = r; onRange && onRange(r); } });
      fLeft.append(rangeHost);

      const locSel = h("select", { class: "field", id: "location-filter", "aria-label": "Location" },
        h("option", { value: "all", text: "All locations" }), h("option", { value: "orem", text: "Orem" }), h("option", { value: "slc", text: "Salt Lake City" }));
      locSel.addEventListener("change", () => { state.location = locSel.value; onLocation && onLocation(locSel.value); });
      fRight.append(h("label", { class: "lbl", for: "location-filter", text: "Location" }), locSel);

      const tabEls = {};
      for (const t of tabs) {
        const b = h("button", { class: "tab" + (t.quiet ? " quiet" : ""), role: "tab", id: "tab-" + t.id, "aria-selected": "false", "aria-controls": "view-" + t.id, type: "button", text: t.label });
        b.addEventListener("click", () => setTab(t.id, true));
        tabEls[t.id] = b; tabList.append(b);
        const v = h("section", { class: "view", id: "view-" + t.id, role: "tabpanel", "aria-labelledby": "tab-" + t.id, hidden: true });
        views[t.id] = v;
      }
      function setTab(id, fromClick) {
        if (!views[id]) id = tabs[0].id;
        current = id;
        for (const t of tabs) { tabEls[t.id].setAttribute("aria-selected", String(t.id === id)); views[t.id].hidden = t.id !== id; }
        const showRange = rangedTabs.includes(id), showLoc = locationTabs.includes(id);
        rangeHost.hidden = !showRange; fRight.hidden = !showLoc; filters.hidden = !(showRange || showLoc);
        if (fromClick) { try { history.replaceState(null, "", "#" + id); } catch { /* ignore */ } }
        onTab && onTab(id);
      }
      const meta = h("div", { class: "brand-meta" },
        h("span", { text: api.base().replace(/^https?:\/\//, "") }),
        h("button", { type: "button", text: "Sign out", onClick: () => auth.signOut() }),
      );
      const top = h("header", { class: "topbar" }, h("div", { class: "topbar-inner" },
        h("div", { class: "brand-row" }, h("div", { class: "brand" }, h("span", { class: "brand-eyebrow", text: "Scorched Studio" }), h("h1", { class: "brand-title", text: title })), meta),
        tabList,
      ));
      page.append(filters, ...Object.values(views));
      root.append(top, page);
      const hash = (location.hash || "").replace(/^#/, "");
      setTab(views[hash] ? hash : tabs[0].id, false);
      window.addEventListener("hashchange", () => { const hsh = (location.hash || "").replace(/^#/, ""); if (views[hsh] && hsh !== current) setTab(hsh, false); });
      return { views, setTab, state, rangeCtl, currentTab: () => current };
    },
  };

  window.Scorched = { api, auth, fmt, dates, range, ui, viz, journal, shell, ApiError, store };
})();
