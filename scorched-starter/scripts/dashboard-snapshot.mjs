#!/usr/bin/env node
// scripts/dashboard-snapshot.mjs
//
// Builds the data documents the Claude reporting dashboard (docs/dashboards,
// one artifact with a Financials and an Operations section) reads. The page
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

  // Financials: unranged reports straight through.
  push("snap", "seasonality", get("/api/admin/accounting/reports/seasonality"));
  push("snap", "balance", get(`/api/admin/accounting/reports/balance-sheet?asOf=${today}`));
  push("snap", "cashflow", get("/api/admin/accounting/reports/cash-flow"));
  push("snap", "normalized", get("/api/admin/accounting/reports/normalized"));
  push("snap", "projections", get("/api/admin/accounting/projections"));

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
  push("snap", "sales-all", { preset: "all", ...get("/api/admin/accounting/reports/sales") });

  // Operations: website traffic from Google Analytics (or a not-connected note).
  const webDocs = websiteDocs(today);
  for (const d of webDocs) push(d.collection, d.doc_id, d.data);
  const webMeta = webDocs.find((d) => d.doc_id === "web-meta").data;

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
