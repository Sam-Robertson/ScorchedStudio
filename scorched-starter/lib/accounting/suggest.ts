// lib/accounting/suggest.ts
//
// Best-effort category suggestion for Inbox transactions that no
// categorization rule recognized. Matches free text against your own
// posting history only — no external calls, nothing auto-posts. Purely
// advisory: pre-fills the Inbox categorize form so you can accept or
// override it.

export type HistoryEntry = {
  key: string;
  tokens: Set<string>;
  template: string;
  targetAccountCode: string | null;
  targetAccountName: string | null;
};

export type Suggestion = {
  template: string;
  targetAccountCode: string | null;
  targetAccountName: string | null;
  confidence: "exact" | "fuzzy";
};

const STOPWORDS = new Set([
  "orig", "co", "name", "id", "descr", "date", "desc", "pymt", "payment",
  "sec", "ccd", "trace", "trn", "ind", "eed", "llc", "inc", "corp", "the",
  "and", "for", "web", "ach", "tel", "ppd", "memo", "card",
]);

// ACH descriptors bury the actual vendor behind a "who paid whom" wrapper
// with fields that change every single occurrence (TRACE#, EED, IND ID) —
// strip those before comparing, otherwise no two occurrences of the same
// vendor would ever look alike.
export function normalizeKey(name: string | null, merchantName: string | null): string {
  if (merchantName && merchantName.trim()) return normalizeText(merchantName);
  if (!name) return "";
  const origMatch = name.match(/ORIG CO NAME:\s*([A-Z0-9 &.,'/-]+?)\s*(?:ORIG ID|DESC DATE|CO ENTRY DESCR|$)/i);
  if (origMatch) return normalizeText(origMatch[1]);
  const stripped = name
    .replace(/TRACE#\S*/gi, " ")
    .replace(/TRN:?\s*\S*/gi, " ")
    .replace(/IND ID:\S*/gi, " ")
    .replace(/EED:\S*/gi, " ")
    .replace(/DESC DATE:\S*/gi, " ")
    .replace(/SEC:\S*/gi, " ")
    .replace(/\b\d{4,}\b/g, " ");
  return normalizeText(stripped);
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokensOf(key: string): Set<string> {
  return new Set(key.split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function buildHistoryIndex(
  rows: { name: string | null; merchantName: string | null; template: string; targetAccountCode: string | null; targetAccountName: string | null }[]
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const r of rows) {
    const key = normalizeKey(r.name, r.merchantName);
    if (!key) continue;
    entries.push({ key, tokens: tokensOf(key), template: r.template, targetAccountCode: r.targetAccountCode, targetAccountName: r.targetAccountName });
  }
  return entries;
}

function majorityOutcome(entries: HistoryEntry[]): { template: string; targetAccountCode: string | null; targetAccountName: string | null } {
  const counts = new Map<string, { count: number; template: string; targetAccountCode: string | null; targetAccountName: string | null }>();
  for (const e of entries) {
    const k = `${e.template}::${e.targetAccountCode ?? ""}`;
    const existing = counts.get(k);
    if (existing) existing.count++;
    else counts.set(k, { count: 1, template: e.template, targetAccountCode: e.targetAccountCode, targetAccountName: e.targetAccountName });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0];
}

const FUZZY_THRESHOLD = 0.6;

export function suggestFor(name: string | null, merchantName: string | null, index: HistoryEntry[]): Suggestion | null {
  const key = normalizeKey(name, merchantName);
  if (!key) return null;
  const tokens = tokensOf(key);
  if (tokens.size === 0) return null;

  const exact = index.filter((e) => e.key === key);
  if (exact.length > 0) return { ...majorityOutcome(exact), confidence: "exact" };

  let bestScore = 0;
  for (const e of index) {
    const score = jaccard(tokens, e.tokens);
    if (score > bestScore) bestScore = score;
  }
  if (bestScore < FUZZY_THRESHOLD) return null;

  const cluster = index.filter((e) => jaccard(tokens, e.tokens) >= FUZZY_THRESHOLD);
  return { ...majorityOutcome(cluster), confidence: "fuzzy" };
}
