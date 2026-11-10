// Helpers for building PostgREST `or=` text filters from a free-text search box.

// A PostgREST `or=` value is a comma-separated list with its own grammar, so a
// search for "smith, john" or "o'brien (jr)" would unbalance the filter. Dots
// survive on purpose: only the first two are parsed as column.operator, so an
// email search still works.
export function sanitizeToken(token: string): string {
  return token.replace(/[,()*%\\"]/g, "").trim();
}

// Splits a search box value into sanitized, non-empty words.
export function searchTokens(raw: string): string[] {
  return raw.split(/\s+/).map(sanitizeToken).filter(Boolean);
}

// One `or=` clause matching a token against any of the columns. Apply one per
// token: successive .or() calls AND together, so "john sm" still matches
// "John Smith" across a first/last name boundary.
export function anyColumnLike(columns: string[], token: string): string {
  return columns.map((c) => `${c}.ilike.*${token}*`).join(",");
}
