#!/usr/bin/env node
// scripts/dashboard-snapshot.mjs
//
// Builds the data documents the Claude reporting dashboard (docs/dashboards,
// one artifact with Home, Money, Customers, Sales and Plan groups) reads. The page
// cannot call this app's API from inside claude.ai (the artifact viewer blocks
// network requests), so Claude publishes a snapshot next to the page instead;
// this script produces that snapshot, one JSON file per document, plus a
// manifest listing which document each file is. Publishing the files is
// Claude's job, see .claude/skills/refresh-dashboards in the repo root.
//
//   node scripts/dashboard-snapshot.mjs                 # from production
//   DASHBOARD_API_BASE=http://localhost:3000 node scripts/dashboard-snapshot.mjs
//
// Plain JavaScript with no dependencies, and HTTP through curl rather than
// fetch, so the same file runs unchanged inside the cloud routine's sandbox
// (whose egress proxy Node's fetch ignores). The daily cloud routine downloads
// this file from the artifact (published next to the page as
// dashboard-snapshot.mjs) and refuses to run it unless its sha256 matches the
// one in the routine prompt: after changing this file, republish it to the
// artifact and put the new hash in the prompt (RemoteTrigger update).
//
// Output: .dashboard-snapshot/data/<collection>/<doc>.json plus
// .dashboard-snapshot/data/manifest.json (the page fetches these as published
// files) and a top-level .dashboard-snapshot/manifest.json for tooling. Signs
// in with ADMIN_PASSWORD from the environment or .env (never printed). Every
// document stays under 256 KiB: journal entries and bookings are split by
// month, and bookings carry a customer group id instead of email or phone, so
// no contact details leave the app.
//
// Website traffic comes from the Google Analytics Data API when GA_PROPERTY_ID
// and GA_SERVICE_ACCOUNT_JSON are set (see "Website traffic" below); without
// them the Website tab shows a not-connected note and everything else still
// refreshes.
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// .env loader (tsx/next are not involved here); real environment wins.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"([\s\S]*)"$/, "$1");
  }
}

const API = (process.env.DASHBOARD_API_BASE || "https://www.scorchedstudio.com").replace(/\/+$/, "");
const OUT = ".dashboard-snapshot";
const DATA_STARTS_AT = "2025-06-06";
const DOC_CAP = 256 * 1024;

// ── HTTP via curl (honors HTTPS_PROXY and the system CA bundle) ──────────────
function curlJson(path, { method = "GET", body, token } = {}) {
  const args = ["-sS", "--fail-with-body", "--max-time", "120", "-X", method, API + path, "-H", "accept: application/json"];
  if (token) args.push("-H", "authorization: Bearer " + token);
  if (body !== undefined) args.push("-H", "content-type: application/json", "--data-binary", "@-");
  let out;
  try {
    out = execFileSync("curl", args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    const detail = (e.stdout || "").toString().slice(0, 300) || (e.stderr || "").toString().split("\n").filter(Boolean).pop() || e.message;
    throw new Error(`${method} ${path}: ${detail}`);
  }
  let json;
  try { json = JSON.parse(out); } catch { throw new Error(`${method} ${path}: response was not JSON`); }
  if (json && json.error) throw new Error(`${method} ${path}: ${json.error}`);
  return json;
}

// Same transport for other hosts (Google OAuth and the Analytics Data API).
function curlRawJson(url, { method = "GET", body, form, bearer } = {}) {
  const args = ["-sS", "--fail-with-body", "--max-time", "120", "-X", method, url, "-H", "accept: application/json"];
  if (bearer) args.push("-H", "authorization: Bearer " + bearer);
  let input;
  if (form !== undefined) { args.push("-H", "content-type: application/x-www-form-urlencoded", "--data-binary", "@-"); input = form; }
  else if (body !== undefined) { args.push("-H", "content-type: application/json", "--data-binary", "@-"); input = JSON.stringify(body); }
  let out;
  try {
    out = execFileSync("curl", args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    // Google error bodies are JSON with a message; surface that, never the request.
    const text = (e.stdout || "").toString();
    let msg = "";
    try { msg = JSON.parse(text).error?.message || JSON.parse(text).error_description || ""; } catch {}
    throw new Error(`${method} ${new URL(url).host}: ${msg || text.slice(0, 200) || (e.stderr || "").toString().split("\n").filter(Boolean).pop() || e.message}`);
  }
  try { return JSON.parse(out); } catch { throw new Error(`${method} ${new URL(url).host}: response was not JSON`); }
}

let token = "";
function signIn() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set (expected in the environment or .env)");
  const json = curlJson("/api/admin/verify", { method: "POST", body: { password } });
  if (!json.token || json.role !== "admin") throw new Error("Sign-in failed: no admin token returned");
  token = json.token;
}
const get = (path) => curlJson(path, { token });

// ── date helpers (mirror shared.js so preset keys line up) ───────────────────
const pad = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toDateStr(new Date());
function monthsBackStart(n) { const d = new Date(); return toDateStr(new Date(d.getFullYear(), d.getMonth() - n, 1)); }
function monthsBetween(startISO, endISO) {
  const [sy, sm] = startISO.slice(0, 7).split("-").map(Number);
  const [ey, em] = endISO.slice(0, 7).split("-").map(Number);
  const out = []; let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${pad(m)}`); m += 1; if (m > 12) { m = 1; y += 1; } }
  return out;
}
function monthEnd(key) { const [y, m] = key.split("-").map(Number); return `${key}-${pad(new Date(y, m, 0).getDate())}`; }
function denverDateKey(iso) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// Customer identity, same rule as the old Capacity tab: bookings share a
// customer when their emails match OR their normalized phones match
// (union-find, transitive). Only the resulting group id is exported.
function customerGroups(bookings) {
  const parent = bookings.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const byEmail = new Map(), byPhone = new Map();
  const normPhone = (p) => { if (!p) return null; let d = p.replace(/\D/g, ""); if (d.length === 11 && d.startsWith("1")) d = d.slice(1); return d.length >= 7 ? d : null; };
  bookings.forEach((b, i) => {
    const email = (b.email || "").toLowerCase().trim();
    if (email) { const prev = byEmail.get(email); if (prev == null) byEmail.set(email, i); else union(prev, i); }
    const phone = normPhone(b.phone);
    if (phone) { const prev = byPhone.get(phone); if (prev == null) byPhone.set(phone, i); else union(prev, i); }
  });
  const ids = new Map(), out = new Map();
  bookings.forEach((b, i) => { const r = find(i); if (!ids.has(r)) ids.set(r, ids.size + 1); out.set(b.id, ids.get(r)); });
  return out;
}

// ── Website traffic (Google Analytics Data API) ─────────────────────────────
// Auth is a service account: a short-lived JWT signed with its private key is
// swapped for an access token, no library needed. GA_SERVICE_ACCOUNT_JSON is
// the key file's contents (raw JSON or base64); GA_PROPERTY_ID the numeric
// GA4 property. The account needs Viewer on the property.
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
// Must match lib/analytics.ts GA_KEY_EVENTS plus GA's own ecommerce events.
const GA_EVENTS = ["booking_confirmed", "course_enrolled", "membership_started", "contact_submitted", "job_application", "newsletter_signup", "purchase", "begin_checkout"];

function gaCredentials() {
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  const propertyId = (process.env.GA_PROPERTY_ID || "").replace(/^properties\//, "").trim();
  if (!raw || !propertyId) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) throw new Error("GA_SERVICE_ACCOUNT_JSON has no client_email/private_key");
  return { sa, propertyId };
}
function gaAccessToken(sa) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: GA_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = curlRawJson("https://oauth2.googleapis.com/token", { method: "POST", form: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${unsigned}.${signature}` });
  if (!res.access_token) throw new Error("Google token endpoint returned no access_token");
  return res.access_token;
}
// Runs one report and returns plain rows: dimension strings then metric numbers,
// in the order requested. GA dates come back as YYYYMMDD; yearMonth as YYYYMM.
function gaReport(auth, { dimensions, metrics, from, to, orderBy, limit = 10000, filter }) {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    limit,
    keepEmptyRows: false,
  };
  if (orderBy) body.orderBys = [{ metric: { metricName: orderBy }, desc: true }];
  if (filter) body.dimensionFilter = { filter: { fieldName: filter.field, inListFilter: { values: filter.values } } };
  const res = curlRawJson(`https://analyticsdata.googleapis.com/v1beta/properties/${auth.propertyId}:runReport`, { method: "POST", bearer: auth.token, body });
  const fixDate = (name, v) => (name === "date" ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : name === "yearMonth" ? `${v.slice(0, 4)}-${v.slice(4, 6)}` : v);
  return (res.rows || []).map((r) => [
    ...r.dimensionValues.map((d, i) => fixDate(dimensions[i], d.value)),
    ...r.metricValues.map((m) => Number(m.value)),
  ]);
}
// Keeps the top N rows per month (rows are [month, key, sessions-ish, ...]).
function topPerMonth(rows, n) {
  const seen = new Map();
  return rows.filter((r) => { const c = seen.get(r[0]) || 0; seen.set(r[0], c + 1); return c < n; });
}
// Returns the web documents, or a single not-connected meta when GA is unset.
// A GA failure is reported in the meta rather than failing the whole snapshot.
function websiteDocs(today) {
  const docs = [];
  let creds;
  try { creds = gaCredentials(); } catch (e) { return [{ collection: "snap", doc_id: "web-meta", data: { connected: false, error: e.message } }]; }
  if (!creds) return [{ collection: "snap", doc_id: "web-meta", data: { connected: false, reason: "GA_PROPERTY_ID and GA_SERVICE_ACCOUNT_JSON are not set" } }];
  // 13 months back, so a month can be compared with the same month last year.
  const from = [monthsBackStart(12), DATA_STARTS_AT].sort().pop();
  try {
    const auth = { propertyId: creds.propertyId, token: gaAccessToken(creds.sa) };
    const run = (opts) => gaReport(auth, { from, to: today, ...opts });
    const web = {
      daily: run({ dimensions: ["date"], metrics: ["sessions", "activeUsers", "newUsers", "screenPageViews", "engagedSessions", "keyEvents", "eventCount", "userEngagementDuration"] }),
      channels: run({ dimensions: ["date", "sessionDefaultChannelGroup"], metrics: ["sessions", "activeUsers", "keyEvents"] }),
      sources: topPerMonth(run({ dimensions: ["yearMonth", "sessionSourceMedium"], metrics: ["sessions", "activeUsers", "keyEvents"], orderBy: "sessions", limit: 5000 }), 40),
      pages: topPerMonth(run({ dimensions: ["yearMonth", "pagePath"], metrics: ["screenPageViews", "activeUsers", "bounceRate", "userEngagementDuration"], orderBy: "screenPageViews", limit: 5000 }), 40),
      events: run({ dimensions: ["date", "eventName"], metrics: ["eventCount", "eventValue"], filter: { field: "eventName", values: GA_EVENTS } }),
      cities: topPerMonth(run({ dimensions: ["yearMonth", "city", "region"], metrics: ["sessions", "activeUsers", "keyEvents"], orderBy: "sessions", limit: 5000 }), 25),
      devices: run({ dimensions: ["yearMonth", "deviceCategory"], metrics: ["sessions", "activeUsers", "keyEvents"] }),
    };
    for (const [id, rows] of Object.entries(web)) docs.push({ collection: "web", doc_id: id, data: { id, from, to: today, rows } });
    docs.push({ collection: "snap", doc_id: "web-meta", data: { connected: true, propertyId: creds.propertyId, from, to: today, fetchedAt: new Date().toISOString(), events: GA_EVENTS, days: web.daily.length } });
  } catch (e) {
    docs.length = 0;
    docs.push({ collection: "snap", doc_id: "web-meta", data: { connected: false, propertyId: creds.propertyId, error: e.message } });
  }
  return docs;
}

// ── Facts for the daily insights ────────────────────────────────────────────
// Deterministic week-over-week and month-over-month comparisons, plus the
// context a recommendation needs: the month against its target, which
// weekdays and time slots fill, how far ahead people book, a six-month trend
// and cash on hand. During the refresh Claude reads this document and writes
// data/snap/insights.json (shown on the Home tab, whose tiles read this file
// too); the numbers come from here, never from eyeballing the raw documents.
// Windows end today (the in-progress day).
function factsDoc({ pl, bookings, salesAll, webDocs, today, balance, cashflow, projections, seasonality }) {
  const shift = (ymd, n) => { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return toDateStr(d); };
  const between = (d, w) => d >= w.start && d <= w.end;
  const win = (n, endOffset = 0) => { const end = shift(today, endOffset); return { start: shift(end, -(n - 1)), end }; };
  const w7 = { now: win(7), prev: win(7, -7) }, w28 = { now: win(28), prev: win(28, -28) };
  const round2 = (x) => Math.round(x * 100) / 100;
  const pct1 = (x) => Math.round(x * 1000) / 10;
  const cmp = (now, prev) => ({ now, prev, changePct: prev > 0 ? pct1((now - prev) / prev) : null });

  // Square net sales per day is the only daily revenue series.
  const daily = (salesAll.daily || []).map((d) => [d.date, d.netSales]);
  const sumDays = (w) => round2(daily.filter(([d]) => between(d, w)).reduce((s, [, v]) => s + v, 0));
  const month = today.slice(0, 7), dom = Number(today.slice(8, 10));
  const pm = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1);
  const prevMonth = `${pm.getFullYear()}-${pad(pm.getMonth() + 1)}`;
  const prevMonthDays = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
  const mtd = { start: month + "-01", end: today };
  const prevMtd = { start: prevMonth + "-01", end: `${prevMonth}-${pad(Math.min(dom, prevMonthDays))}` };

  // Ledger: last full month vs the one before (the in-progress month is excluded).
  const months = [...pl.months].sort((a, b) => a.period_month.localeCompare(b.period_month)).filter((m) => m.period_month.slice(0, 7) < month);
  const lineSum = (code, ym) => round2(pl.lines.filter((l) => l.code === code && l.period_month.slice(0, 7) === ym).reduce((s, l) => s + Number(l.amount), 0));
  const ledgerMonth = (m) => (m ? { month: m.period_month.slice(0, 7), revenue: round2(m.revenue), grossProfit: round2(m.gross_profit), operatingExpenses: round2(m.operating_expenses), ebitda: round2(m.ebitda), netIncome: round2(m.net_income), marketing: lineSum("6200", m.period_month.slice(0, 7)), labor: round2(lineSum("6000", m.period_month.slice(0, 7)) + lineSum("6010", m.period_month.slice(0, 7))) } : null);

  // Bookings by the Denver day they were made; seats by session date.
  const created = (b) => denverDateKey(b.created_at);
  const madeIn = (w) => bookings.filter((b) => between(created(b), w));
  const confirmedIn = (w) => madeIn(w).filter((b) => b.status === "confirmed");
  const seatsFor = (w) => bookings.filter((b) => b.status === "confirmed" && between(b.date, w)).reduce((s, b) => s + b.party_size, 0);
  const sourceShares = (w) => {
    const list = confirmedIn(w), m = new Map();
    for (const b of list) { const k = b.referral_source || "(not recorded)"; m.set(k, (m.get(k) || 0) + 1); }
    return [...m].map(([source, count]) => ({ source, count, sharePct: list.length ? pct1(count / list.length) : 0 })).sort((a, b) => b.count - a.count).slice(0, 6);
  };
  const cancelRate = (w) => { const l = madeIn(w); return l.length ? pct1(l.filter((b) => b.status === "cancelled").length / l.length) : null; };
  const avgParty = (w) => { const l = confirmedIn(w); return l.length ? Math.round((l.reduce((s, b) => s + b.party_size, 0) / l.length) * 10) / 10 : null; };
  const confirmedAll = bookings.filter((b) => b.status === "confirmed").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups = customerGroups(confirmedAll);
  const firstSeen = new Map();
  for (const b of confirmedAll) { const g = groups.get(b.id); if (!firstSeen.has(g)) firstSeen.set(g, created(b)); }
  const returningIn = (w) => confirmedIn(w).filter((b) => firstSeen.get(groups.get(b.id)) < created(b)).length;
  const byLocation = (w) => { const m = {}; for (const b of confirmedIn(w)) { const k = b.location || "orem"; m[k] = (m[k] || 0) + 1; } return m; };

  const facts = {
    asOf: today,
    windows: { last7: w7.now, prev7: w7.prev, last28: w28.now, prev28: w28.prev, monthToDate: mtd, prevMonthToSamePoint: prevMtd },
    squareSales: {
      note: "Square net sales per day (in-studio). Online bookings, courses and memberships go through Stripe and are not in these figures; the ledger below has everything.",
      last7: cmp(sumDays(w7.now), sumDays(w7.prev)), last28: cmp(sumDays(w28.now), sumDays(w28.prev)), monthToDate: cmp(sumDays(mtd), sumDays(prevMtd)),
    },
    ledger: { note: "Cash-basis ledger, whole months only.", lastFullMonth: ledgerMonth(months[months.length - 1]), monthBefore: ledgerMonth(months[months.length - 2]) },
    bookings: {
      note: "Online bookings only (launched " + ONLINE_BOOKING_LAUNCH_NOTE + "). 'madeConfirmed' counts by the day the booking was created; 'seats' by session date. seats.next7.now is what is booked so far for the coming 7 days (more will be added, bookings are usually made close to the date) against the past 7 days' seats.",
      madeConfirmed: { last7: cmp(confirmedIn(w7.now).length, confirmedIn(w7.prev).length), last28: cmp(confirmedIn(w28.now).length, confirmedIn(w28.prev).length) },
      seats: { last7: cmp(seatsFor(w7.now), seatsFor(w7.prev)), next7: cmp(seatsFor({ start: shift(today, 1), end: shift(today, 7) }), seatsFor({ start: shift(today, -6), end: today })) },
      cancellationRatePct: { last28: cancelRate(w28.now), prev28: cancelRate(w28.prev) },
      avgPartySize: { last28: avgParty(w28.now), prev28: avgParty(w28.prev) },
      sources: { last28: sourceShares(w28.now), prev28: sourceShares(w28.prev) },
      returning: { last28: { returning: returningIn(w28.now), confirmed: confirmedIn(w28.now).length }, prev28: { returning: returningIn(w28.prev), confirmed: confirmedIn(w28.prev).length } },
      byLocation: { last28: byLocation(w28.now) },
    },
    web: null,
  };

  // Targets (Plan tab): the month in progress against its target, and the last full month.
  const tRows = (projections && projections.projectionVsActual) || [];
  const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  if (tRows.length) {
    const tFor = (ym) => tRows.find((r) => String(r.period_month).slice(0, 7) === ym);
    const cur = pl.months.find((m) => m.period_month.slice(0, 7) === month);
    const n = (v) => (v == null ? null : round2(Number(v)));
    const t = tFor(month);
    const lastFull = months[months.length - 1], lt = lastFull ? tFor(lastFull.period_month.slice(0, 7)) : null;
    let thisMonth = null;
    if (t) {
      const soFar = round2(cur ? Number(cur.revenue) : 0), tr = n(t.proj_revenue), left = Math.max(1, dim - dom);
      thisMonth = { month, revenueTarget: tr, revenueSoFar: soFar, revenuePctOfTarget: tr ? pct1(soFar / tr) : null, elapsedPct: pct1(dom / dim), onPaceFor: round2(soFar / (dom / dim)), neededPerDay: tr ? round2(Math.max(0, tr - soFar) / left) : null, daysLeft: dim - dom, ebitdaTarget: n(t.proj_ebitda), ebitdaSoFar: round2(cur ? Number(cur.ebitda) : 0) };
    }
    facts.targets = {
      note: "Monthly revenue and EBITDA targets Sam entered (Plan tab). thisMonth compares the ledger month to date with its target: revenuePctOfTarget above elapsedPct means ahead of pace. onPaceFor scales month-to-date revenue to a full month. neededPerDay is what the remaining days must average to land on target.",
      monthsWithTargets: tRows.length,
      thisMonth,
      lastFullMonth: lt && lastFull ? { month: lastFull.period_month.slice(0, 7), revenueTarget: n(lt.proj_revenue), revenueActual: round2(lastFull.revenue), ebitdaTarget: n(lt.proj_ebitda), ebitdaActual: round2(lastFull.ebitda) } : null,
    };
  } else {
    facts.targets = null;
  }

  // Capacity: which session days and times fill, so a recommendation can point at the quiet ones.
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const emptyWeek = () => ({ Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 });
  const dowOf = (ymd) => DOW[new Date(ymd + "T12:00:00").getDay()];
  const seatsByDow = (w) => { const m = emptyWeek(); for (const b of bookings) if (b.status === "confirmed" && between(b.date, w)) m[dowOf(b.date)] += b.party_size; return m; };
  const topSlots = (w) => { const m = new Map(); for (const b of bookings) if (b.status === "confirmed" && between(b.date, w) && b.time_slot) m.set(b.time_slot, (m.get(b.time_slot) || 0) + 1); return [...m].map(([slot, count]) => ({ slot, bookings: count })).sort((a, b) => b.bookings - a.bookings).slice(0, 5); };
  const leadDays = (w) => { const xs = bookings.filter((b) => b.status === "confirmed" && between(created(b), w)).map((b) => Math.round((new Date(b.date + "T12:00:00") - new Date(created(b) + "T12:00:00")) / 86400000)).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
  facts.capacity = {
    note: "Confirmed seats by session weekday (last 28 days vs the 28 before), the busiest time slots, and the median days between booking and visit. Low weekdays are where a promotion has room.",
    seatsByWeekday: { last28: seatsByDow(w28.now), prev28: seatsByDow(w28.prev) },
    topSlots: { last28: topSlots(w28.now) },
    medianLeadTimeDays: { last28: leadDays(w28.now), prev28: leadDays(w28.prev) },
  };
  const salesByDow = (w) => { const m = emptyWeek(); for (const [d, v] of daily) if (between(d, w)) m[dowOf(d)] = round2(m[dowOf(d)] + v); return m; };
  facts.squareSales.byWeekday = { last28: salesByDow(w28.now), prev28: salesByDow(w28.prev) };

  // Trend: six full months plus the month in progress, for direction and seasonality.
  const bookingsMadeIn = (ym) => bookings.filter((b) => b.status === "confirmed" && created(b).slice(0, 7) === ym).length;
  const seatsIn = (ym) => bookings.filter((b) => b.status === "confirmed" && b.date.slice(0, 7) === ym).reduce((s, b) => s + b.party_size, 0);
  const trendMonths = [...months.slice(-6), ...pl.months.filter((m) => m.period_month.slice(0, 7) === month)];
  const lastYear = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const lyRow = ((seasonality && seasonality.rows) || []).find((x) => String(x.period_month).slice(0, 7) === lastYear);
  facts.trend = {
    note: "Oldest first; the last row is the month in progress (partial). bookingsMade counts confirmed online bookings by the day they were made (none before " + ONLINE_BOOKING_LAUNCH_NOTE + "); seats by session date; marketing is ledger account 6200.",
    months: trendMonths.map((m) => { const ym = m.period_month.slice(0, 7); return { month: ym, partial: ym === month, revenue: round2(m.revenue), ebitda: round2(m.ebitda), netIncome: round2(m.net_income), marketing: lineSum("6200", ym), bookingsMade: bookingsMadeIn(ym), seats: seatsIn(ym) }; }),
    sameMonthLastYear: lyRow ? { month: lastYear, revenue: round2(Number(lyRow.revenue)) } : null,
  };

  // Cash: what is in the bank and whether running the studio adds to it.
  const cashRows = ((balance && balance.rows) || []).filter((r) => r.type === "asset" && ["1000", "1100", "1110"].includes(String(r.code)));
  const opCash = new Map();
  for (const r of (cashflow && cashflow.rows) || []) if (r.activity === "operating") { const ym = String(r.period_month).slice(0, 7); opCash.set(ym, round2((opCash.get(ym) || 0) + Number(r.net_change))); }
  const opKeys = [...opCash.keys()].filter((k) => k < month).sort();
  const opAt = (i) => (opKeys[i] ? { month: opKeys[i], amount: opCash.get(opKeys[i]) } : null);
  facts.cash = {
    note: "Balance sheet as of today: checking plus the Square and Stripe clearing accounts. operatingCashFlow is cash from running the studio by month, before loan payments and purchases.",
    onHand: round2(cashRows.reduce((s, r) => s + Number(r.balance), 0)),
    byAccount: cashRows.map((r) => ({ name: r.name, balance: round2(Number(r.balance)) })),
    operatingCashFlow: { lastFullMonth: opAt(opKeys.length - 1), monthBefore: opAt(opKeys.length - 2) },
  };

  const webDoc = (id) => (webDocs.find((d) => d.collection === "web" && d.doc_id === id) || {}).data;
  const wd = webDoc("daily");
  if (wd) {
    const rowsIn = (rows, w) => rows.filter((r) => between(r[0], w));
    const sum = (rows, i) => rows.reduce((s, r) => s + r[i], 0);
    const sessions = (w) => sum(rowsIn(wd.rows, w), 1), users = (w) => sum(rowsIn(wd.rows, w), 2), newUsers = (w) => sum(rowsIn(wd.rows, w), 3), engaged = (w) => sum(rowsIn(wd.rows, w), 5);
    const channelShares = (w) => {
      const list = rowsIn(webDoc("channels").rows, w), total = sum(list, 2), m = new Map();
      for (const r of list) m.set(r[1], (m.get(r[1]) || 0) + r[2]);
      return [...m].map(([channel, s]) => ({ channel, sessions: s, sharePct: total ? pct1(s / total) : 0 })).sort((a, b) => b.sessions - a.sessions).slice(0, 6);
    };
    const eventCounts = (w) => { const m = {}; for (const r of rowsIn(webDoc("events").rows, w)) m[r[1]] = (m[r[1]] || 0) + r[2]; return m; };
    const topPages = (ym) => { const m = new Map(); for (const r of webDoc("pages").rows.filter((r) => r[0] === ym && !String(r[1]).startsWith("/admin"))) m.set(r[1], (m.get(r[1]) || 0) + r[2]); return [...m].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 8); };
    facts.web = {
      note: "Google Analytics. Yesterday fills in during the morning, so the last day is usually light.",
      sessions: { last7: cmp(sessions(w7.now), sessions(w7.prev)), last28: cmp(sessions(w28.now), sessions(w28.prev)) },
      visitors: { last28: cmp(users(w28.now), users(w28.prev)), newSharePct: { last28: users(w28.now) ? pct1(newUsers(w28.now) / users(w28.now)) : null } },
      engagementRatePct: { last28: sessions(w28.now) ? pct1(engaged(w28.now) / sessions(w28.now)) : null, prev28: sessions(w28.prev) ? pct1(engaged(w28.prev) / sessions(w28.prev)) : null },
      channels: { last28: channelShares(w28.now), prev28: channelShares(w28.prev) },
      events: { last7: eventCounts(w7.now), last28: eventCounts(w28.now) },
      topPages: { thisMonth: topPages(month), lastMonth: topPages(prevMonth) },
    };
  }
  return facts;
}
const ONLINE_BOOKING_LAUNCH_NOTE = "2026-03-24";

function main() {
  signIn();
  const generatedAt = new Date().toISOString();
  const today = todayStr();
  const docs = [];
  const push = (collection, doc_id, data) => docs.push({ collection, doc_id, data });

  // Full-history P&L (months + account lines). Every ranged report in both
  // sections derives from this one document.
  const pl = get("/api/admin/accounting/reports/pl");
  const accounts = {};
  for (const l of pl.lines) accounts[l.code] = { name: l.name, type: l.type };
  push("snap", "pl", { months: pl.months, lines: pl.lines, dataStartsAt: pl.dataStartsAt || DATA_STARTS_AT });

  // Money and Plan: unranged reports straight through (the facts below reuse them).
  const seasonality = get("/api/admin/accounting/reports/seasonality");
  const balance = get(`/api/admin/accounting/reports/balance-sheet?asOf=${today}`);
  const cashflow = get("/api/admin/accounting/reports/cash-flow");
  const projections = get("/api/admin/accounting/projections");
  push("snap", "seasonality", seasonality);
  push("snap", "balance", balance);
  push("snap", "cashflow", cashflow);
  push("snap", "normalized", get("/api/admin/accounting/reports/normalized"));
  push("snap", "projections", projections);

  // Financials: journal lines per month for the drill-downs. Compact rows:
  // [id, date, memo, [[code, amount, lineMemo], ...]].
  const months = monthsBetween(DATA_STARTS_AT, today);
  let journalEntries = 0; const capped = [];
  for (const m of months) {
    const { entries } = get(`/api/admin/accounting/journal-entries?from=${m}-01&to=${monthEnd(m)}&limit=500`);
    if (entries.length >= 500) capped.push(m);
    const rows = entries.map((e) => [e.id, e.entry_date, e.memo, e.journal_lines.filter((l) => l.accounts).map((l) => [l.accounts.code, Number(l.amount), l.memo && l.memo !== e.memo ? l.memo : null])]);
    for (const e of entries) for (const l of e.journal_lines) if (l.accounts && !accounts[l.accounts.code]) accounts[l.accounts.code] = { name: l.accounts.name, type: l.accounts.type };
    journalEntries += entries.length;
    push("journal", m, { month: m, entries: rows, capped: entries.length >= 500 });
  }
  push("snap", "accounts", { codes: accounts });

  // Operations: bookings by created month (Denver), contact details replaced
  // by a customer group id; pre-launch estimate; Square sales per preset.
  const bookings = get("/api/admin/bookings");
  const groups = customerGroups(bookings);
  const byMonth = new Map();
  for (const b of bookings) {
    const m = denverDateKey(b.created_at).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push([b.created_at, b.date, b.time_slot, b.party_size, b.amount_paid, b.status, b.referral_source, b.referral_other, b.location, groups.get(b.id)]);
  }
  for (const [m, rows] of byMonth) push("bookings", m, { month: m, rows });
  push("snap", "estimated", get("/api/admin/accounting/reports/estimated-bookings"));

  const presets = { "3m": monthsBackStart(2), "6m": monthsBackStart(5), ytd: `${new Date().getFullYear()}-01-01` };
  for (const [preset, start] of Object.entries(presets)) {
    push("snap", `sales-${start}`, { preset, start, ...get(`/api/admin/accounting/reports/sales?start=${start}&end=${today}`) });
  }
  const salesAll = { preset: "all", ...get("/api/admin/accounting/reports/sales") };
  push("snap", "sales-all", salesAll);

  // Operations: website traffic from Google Analytics (or a not-connected note).
  const webDocs = websiteDocs(today);
  for (const d of webDocs) push(d.collection, d.doc_id, d.data);
  const webMeta = webDocs.find((d) => d.doc_id === "web-meta").data;

  // Comparisons for the written insights (see factsDoc).
  push("snap", "facts", factsDoc({ pl, bookings, salesAll, webDocs, today, balance, cashflow, projections, seasonality }));

  push("snap", "meta", { generatedAt, apiBase: API, dataStartsAt: DATA_STARTS_AT, balanceAsOf: today, salesPresets: { ...presets, all: "" }, bookingMonths: [...byMonth.keys()].sort(), journalMonths: months, bookings: bookings.length, journalEntries });

  // Write files + manifests: one self-contained data/ folder, published next
  // to the page, with the manifest the page reads first.
  rmSync(OUT, { recursive: true, force: true });
  const manifest = [];
  for (const d of docs) {
    const rel = `data/${d.collection}/${d.doc_id}.json`;
    const file = join(OUT, rel);
    mkdirSync(join(OUT, "data", d.collection), { recursive: true });
    const body = JSON.stringify(d.data);
    if (body.length > DOC_CAP) throw new Error(`${file} is ${body.length} bytes, over the 256 KiB cap`);
    writeFileSync(file, body);
    manifest.push({ collection: d.collection, doc_id: d.doc_id, path: rel, file, bytes: body.length });
  }
  writeFileSync(join(OUT, "data", "manifest.json"), JSON.stringify({ generatedAt, docs: manifest.map(({ collection, doc_id, path, bytes }) => ({ collection, doc_id, path, bytes })) }));
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ generatedAt, apiBase: API, docs: manifest }, null, 2));

  const total = manifest.reduce((s, m) => s + m.bytes, 0);
  console.log(`Snapshot from ${API} at ${generatedAt}`);
  console.log(`  ${manifest.length} docs, ${(total / 1024).toFixed(0)} KiB (${journalEntries} journal entries over ${months.length} months, ${bookings.length} bookings)`);
  console.log(webMeta.connected ? `  website: Google Analytics property ${webMeta.propertyId}, ${webMeta.days} days from ${webMeta.from}` : `  website: not connected (${webMeta.error || webMeta.reason})`);
  if (capped.length) console.log(`  WARNING: journal months at the 500-entry API cap, drill-downs incomplete there: ${capped.join(", ")}`);
  console.log(`  manifest: ${join(OUT, "manifest.json")}`);
}

try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
