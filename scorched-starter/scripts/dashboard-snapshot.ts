// scripts/dashboard-snapshot.ts
//
// Builds the data documents the two Claude dashboards (docs/dashboards) read
// from their own artifact database. The dashboards cannot call this app's API
// from inside claude.ai (the artifact viewer blocks network requests), so
// Claude pushes a snapshot into each artifact's database instead; this script
// produces that snapshot, one JSON file per document, and a manifest listing
// which document each file is. Writing them to the artifacts is Claude's job
// (ArtifactData batch), see .claude/skills/refresh-dashboards in the repo root.
//
//   pnpm tsx scripts/dashboard-snapshot.ts            # from production
//   DASHBOARD_API_BASE=http://localhost:3000 pnpm tsx scripts/dashboard-snapshot.ts
//
// Output: .dashboard-snapshot/{financials,operations}/<collection>__<doc>.json
// plus .dashboard-snapshot/manifest.json. Signs in with ADMIN_PASSWORD from
// .env (never printed). Every document stays under the store's 256 KiB cap:
// journal entries and bookings are split by month, and bookings carry a
// customer group id instead of email or phone, so no contact details leave
// the app.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env";

loadEnv();

const API = (process.env.DASHBOARD_API_BASE || "https://www.scorchedstudio.com").replace(/\/+$/, "");
const OUT = ".dashboard-snapshot";
const DATA_STARTS_AT = "2025-06-06";
const DOC_CAP = 256 * 1024;

type Json = Record<string, unknown>;
type Doc = { artifact: "financials" | "operations"; collection: string; doc_id: string; data: Json };

let token = "";
async function signIn() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set (expected in .env)");
  const res = await fetch(API + "/api/admin/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
  const json = (await res.json()) as { token?: string; role?: string; error?: string };
  if (!json.token || json.role !== "admin") throw new Error("Sign-in failed: " + (json.error || "no admin token"));
  token = json.token;
}
async function get<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
  const json = await res.json();
  if (!res.ok || json?.error) throw new Error(`${path}: ${json?.error || res.statusText}`);
  return json as T;
}

// ── date helpers (mirror shared.js so preset keys line up) ───────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toDateStr(new Date());
function monthsBackStart(n: number) { const d = new Date(); return toDateStr(new Date(d.getFullYear(), d.getMonth() - n, 1)); }
function monthsBetween(startISO: string, endISO: string): string[] {
  const [sy, sm] = startISO.slice(0, 7).split("-").map(Number);
  const [ey, em] = endISO.slice(0, 7).split("-").map(Number);
  const out: string[] = []; let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${pad(m)}`); m += 1; if (m > 12) { m = 1; y += 1; } }
  return out;
}
function monthEnd(key: string) { const [y, m] = key.split("-").map(Number); return `${key}-${pad(new Date(y, m, 0).getDate())}`; }
function denverDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// ── shapes ───────────────────────────────────────────────────────────────────
type PlResponse = { months: Json[]; lines: { period_month: string; code: string; name: string; type: string; amount: number }[]; dataStartsAt?: string };
type JournalEntry = { id: string; entry_date: string; memo: string | null; journal_lines: { amount: number; memo: string | null; accounts: { code: string; name: string; type: string } | null }[] };
type Booking = { id: string; email: string; phone: string | null; date: string; time_slot: string; party_size: number; amount_paid: number; status: string; referral_source: string | null; referral_other: string | null; location: string; created_at: string };

// Customer identity, same rule as the old Capacity tab: bookings share a
// customer when their emails match OR their normalized phones match
// (union-find, transitive). Only the resulting group id is exported.
function customerGroups(bookings: Booking[]): Map<string, number> {
  const parent = bookings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const byEmail = new Map<string, number>(), byPhone = new Map<string, number>();
  const normPhone = (p: string | null) => { if (!p) return null; let d = p.replace(/\D/g, ""); if (d.length === 11 && d.startsWith("1")) d = d.slice(1); return d.length >= 7 ? d : null; };
  bookings.forEach((b, i) => {
    const email = (b.email || "").toLowerCase().trim();
    if (email) { const prev = byEmail.get(email); if (prev == null) byEmail.set(email, i); else union(prev, i); }
    const phone = normPhone(b.phone);
    if (phone) { const prev = byPhone.get(phone); if (prev == null) byPhone.set(phone, i); else union(prev, i); }
  });
  const ids = new Map<number, number>(); const out = new Map<string, number>();
  bookings.forEach((b, i) => { const r = find(i); if (!ids.has(r)) ids.set(r, ids.size + 1); out.set(b.id, ids.get(r)!); });
  return out;
}

async function main() {
  await signIn();
  const generatedAt = new Date().toISOString();
  const today = todayStr();
  const docs: Doc[] = [];
  const push = (artifact: Doc["artifact"], collection: string, doc_id: string, data: Json) => docs.push({ artifact, collection, doc_id, data });

  // Shared: full-history P&L (months + account lines). Every ranged report
  // on both dashboards derives from this one document.
  const pl = await get<PlResponse>("/api/admin/accounting/reports/pl");
  const accounts: Record<string, { name: string; type: string }> = {};
  for (const l of pl.lines) accounts[l.code] = { name: l.name, type: l.type };
  const plDoc = { months: pl.months, lines: pl.lines, dataStartsAt: pl.dataStartsAt || DATA_STARTS_AT };
  push("financials", "snap", "pl", plDoc);
  push("operations", "snap", "pl", plDoc);
  push("financials", "snap", "accounts", { codes: accounts });

  // Financials: unranged reports straight through.
  push("financials", "snap", "seasonality", await get("/api/admin/accounting/reports/seasonality"));
  push("financials", "snap", "balance", await get(`/api/admin/accounting/reports/balance-sheet?asOf=${today}`));
  push("financials", "snap", "cashflow", await get("/api/admin/accounting/reports/cash-flow"));
  push("financials", "snap", "normalized", await get("/api/admin/accounting/reports/normalized"));
  push("financials", "snap", "projections", await get("/api/admin/accounting/projections"));

  // Financials: journal lines per month for the drill-downs. Compact rows:
  // [id, date, memo, [[code, amount, lineMemo], ...]].
  const months = monthsBetween(DATA_STARTS_AT, today);
  let journalEntries = 0; const capped: string[] = [];
  for (const m of months) {
    const { entries } = await get<{ entries: JournalEntry[] }>(`/api/admin/accounting/journal-entries?from=${m}-01&to=${monthEnd(m)}&limit=500`);
    if (entries.length >= 500) capped.push(m);
    const rows = entries.map((e) => [e.id, e.entry_date, e.memo, e.journal_lines.filter((l) => l.accounts).map((l) => [l.accounts!.code, Number(l.amount), l.memo && l.memo !== e.memo ? l.memo : null])]);
    for (const e of entries) for (const l of e.journal_lines) if (l.accounts && !accounts[l.accounts.code]) accounts[l.accounts.code] = { name: l.accounts.name, type: l.accounts.type };
    journalEntries += entries.length;
    push("financials", "journal", m, { month: m, entries: rows, capped: entries.length >= 500 });
  }

  // Operations: bookings by created month (Denver), contact details replaced
  // by a customer group id; pre-launch estimate; Square sales per preset.
  const bookings = await get<Booking[]>("/api/admin/bookings");
  const groups = customerGroups(bookings);
  const byMonth = new Map<string, unknown[][]>();
  for (const b of bookings) {
    const m = denverDateKey(b.created_at).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push([b.created_at, b.date, b.time_slot, b.party_size, b.amount_paid, b.status, b.referral_source, b.referral_other, b.location, groups.get(b.id)]);
  }
  for (const [m, rows] of byMonth) push("operations", "bookings", m, { month: m, rows });
  push("operations", "snap", "estimated", await get("/api/admin/accounting/reports/estimated-bookings"));

  const presets: Record<string, string> = { "3m": monthsBackStart(2), "6m": monthsBackStart(5), ytd: `${new Date().getFullYear()}-01-01` };
  for (const [preset, start] of Object.entries(presets)) {
    push("operations", "snap", `sales-${start}`, { preset, start, ...(await get<Json>(`/api/admin/accounting/reports/sales?start=${start}&end=${today}`)) });
  }
  push("operations", "snap", "sales-all", { preset: "all", ...(await get<Json>("/api/admin/accounting/reports/sales")) });

  const meta = { generatedAt, apiBase: API, dataStartsAt: DATA_STARTS_AT, balanceAsOf: today, salesPresets: { ...presets, all: "" }, bookingMonths: [...byMonth.keys()].sort(), journalMonths: months, bookings: bookings.length, journalEntries };
  push("financials", "snap", "meta", meta);
  push("operations", "snap", "meta", meta);

  // Write files + manifest.
  rmSync(OUT, { recursive: true, force: true });
  const manifest: { artifact: string; collection: string; doc_id: string; file: string; bytes: number }[] = [];
  for (const d of docs) {
    const dir = join(OUT, d.artifact); mkdirSync(dir, { recursive: true });
    const file = join(dir, `${d.collection}__${d.doc_id}.json`);
    const body = JSON.stringify(d.data);
    if (body.length > DOC_CAP) throw new Error(`${file} is ${body.length} bytes, over the 256 KiB document cap`);
    writeFileSync(file, body);
    manifest.push({ artifact: d.artifact, collection: d.collection, doc_id: d.doc_id, file, bytes: body.length });
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ generatedAt, apiBase: API, docs: manifest }, null, 2));

  const total = (a: string) => manifest.filter((m) => m.artifact === a).reduce((s, m) => s + m.bytes, 0);
  console.log(`Snapshot from ${API} at ${generatedAt}`);
  console.log(`  financials: ${manifest.filter((m) => m.artifact === "financials").length} docs, ${(total("financials") / 1024).toFixed(0)} KiB (${journalEntries} journal entries over ${months.length} months)`);
  console.log(`  operations: ${manifest.filter((m) => m.artifact === "operations").length} docs, ${(total("operations") / 1024).toFixed(0)} KiB (${bookings.length} bookings)`);
  if (capped.length) console.log(`  WARNING: journal months at the 500-entry API cap, drill-downs incomplete there: ${capped.join(", ")}`);
  console.log(`  manifest: ${join(OUT, "manifest.json")}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
