// lib/marketing/csv-import.ts
//
// CSV parsing and column detection for the legacy SMS import. Pure and free of
// Supabase imports so the project's test runner can exercise the header
// matching, which is the part most likely to be wrong: the export format from
// the old service is not known ahead of time.

// A minimal RFC 4180 reader. Written rather than pulled in as a dependency
// because the whole need is one throwaway import, and the quoting rules that
// matter (quoted fields, embedded commas, doubled quotes) are short.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM, which spreadsheet exports very often carry and which
  // would otherwise become part of the first header name.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing blank lines, which almost every export has.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Ordered by confidence: the first pattern that matches wins, so "mobilephone"
// is read as a phone rather than falling through to something vaguer.
const PHONE_PATTERNS = ["phonenumber", "mobilenumber", "phone", "mobile", "cell", "msisdn", "number", "to"];
const FIRST_NAME_PATTERNS = ["firstname", "fname", "givenname", "first"];
const LAST_NAME_PATTERNS = ["lastname", "lname", "surname", "familyname", "last"];
const FULL_NAME_PATTERNS = ["fullname", "name", "contactname"];
const DATE_PATTERNS = [
  "optindate", "optedinat", "subscribedat", "subscribedate", "signupdate",
  "datesubscribed", "createdat", "datecreated", "created", "date", "timestamp",
];
const STATUS_PATTERNS = ["status", "subscriptionstatus", "subscribed", "state", "optstatus"];
const EMAIL_PATTERNS = ["emailaddress", "email", "mail"];

function findColumn(headers: string[], patterns: string[]): number {
  const normalized = headers.map(normalizeHeader);

  // Exact match first, so a column literally called "phone" always beats a
  // column called "phonecarrierlookup".
  for (const pattern of patterns) {
    const exact = normalized.indexOf(pattern);
    if (exact !== -1) return exact;
  }
  for (const pattern of patterns) {
    const partial = normalized.findIndex((h) => h.includes(pattern));
    if (partial !== -1) return partial;
  }
  return -1;
}

export type ColumnMap = {
  phone: number;
  firstName: number;
  lastName: number;
  fullName: number;
  date: number;
  status: number;
  email: number;
};

export type ColumnOverrides = Partial<Record<keyof ColumnMap, string>>;

export class NoPhoneColumnError extends Error {
  // Declared rather than written as a constructor parameter property: the test
  // runner uses node's strip-only TypeScript mode, which does not support them.
  readonly headers: string[];

  constructor(headers: string[]) {
    super(
      `Could not find a phone column. Headers found: ${headers.map((h) => JSON.stringify(h)).join(", ")}. ` +
        `Pass --phone-col "<header>" to say which one it is.`
    );
    this.name = "NoPhoneColumnError";
    this.headers = headers;
  }
}

export function detectColumns(headers: string[], overrides: ColumnOverrides = {}): ColumnMap {
  const resolve = (key: keyof ColumnMap, patterns: string[]): number => {
    const override = overrides[key];
    if (override) {
      const wanted = normalizeHeader(override);
      const idx = headers.map(normalizeHeader).indexOf(wanted);
      if (idx === -1) {
        throw new Error(
          `--${key}-col "${override}" does not match any header. Headers found: ${headers.join(", ")}`
        );
      }
      return idx;
    }
    return findColumn(headers, patterns);
  };

  const map: ColumnMap = {
    phone: resolve("phone", PHONE_PATTERNS),
    firstName: resolve("firstName", FIRST_NAME_PATTERNS),
    lastName: resolve("lastName", LAST_NAME_PATTERNS),
    fullName: resolve("fullName", FULL_NAME_PATTERNS),
    date: resolve("date", DATE_PATTERNS),
    status: resolve("status", STATUS_PATTERNS),
    email: resolve("email", EMAIL_PATTERNS),
  };

  // A phone column is the one thing the import cannot proceed without, so
  // failing here with the actual headers beats a run that imports nothing.
  if (map.phone === -1) throw new NoPhoneColumnError(headers);

  return map;
}

// Splits "Jane Q Smith" into first and last. Only used when the export has a
// single name column.
export function splitFullName(full: string): { firstName: string | null; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Old exports carry dates in every imaginable shape. An unparseable one
// returns null, and the caller falls back to leaving occurred_at at its
// default rather than inventing a date.
export function parseOptInDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // A bare US-style date is ambiguous with the ISO reading, so it is handled
  // explicitly rather than left to Date's own guessing.
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const year = Number(y.length === 2 ? `20${y}` : y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject implausible years, which is what a mis-parsed serial number looks like.
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return parsed.toISOString();
}

// Whether a status cell from the old service means "do not message".
const UNSUBSCRIBED_WORDS = [
  "unsubscribed", "unsubscribe", "opted out", "optedout", "opt out", "optout",
  "inactive", "stopped", "stop", "removed", "blocked", "false", "no", "0",
];

export function statusMeansUnsubscribed(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  return UNSUBSCRIBED_WORDS.includes(normalized);
}
