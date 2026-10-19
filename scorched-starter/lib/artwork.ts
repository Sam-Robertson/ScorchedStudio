// lib/artwork.ts
//
// Shared validation for the artwork lease routes. Pure, so the browser form
// and the tests can use it too.

export const ARTWORK_STATUSES = ["on_display", "returned", "sold"] as const;
export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

export const ARTWORK_STATUS_LABELS: Record<ArtworkStatus, string> = {
  on_display: "On display",
  returned: "Returned to artist",
  sold: "Sold",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ArtworkInput = {
  title: string;
  artist_name: string;
  artist_email: string | null;
  artist_phone: string | null;
  medium: string | null;
  dimensions: string | null;
  location: "orem" | "slc";
  lease_start: string;
  lease_end: string | null;
  sale_price_cents: number | null;
  commission_percent: number | null;
  status: ArtworkStatus;
  agreement_notes: string | null;
};

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Turns a request body into a row, or explains what is wrong with it. Every
// field is validated so a partial PATCH and a full POST share one path.
export function parseArtworkInput(body: Record<string, unknown>): { ok: true; row: ArtworkInput } | { ok: false; error: string } {
  const title = text(body.title);
  const artist_name = text(body.artist_name);
  if (!title) return { ok: false, error: "Title is required" };
  if (!artist_name) return { ok: false, error: "Artist name is required" };

  const lease_start = text(body.lease_start);
  if (!lease_start || !DATE_RE.test(lease_start)) return { ok: false, error: "Lease start must be a date" };
  const lease_end = text(body.lease_end);
  if (lease_end && !DATE_RE.test(lease_end)) return { ok: false, error: "Lease end must be a date" };
  if (lease_end && lease_end < lease_start) return { ok: false, error: "Lease end must be after lease start" };

  const location = body.location === "slc" ? "slc" : "orem";

  const status = ARTWORK_STATUSES.includes(body.status as ArtworkStatus) ? (body.status as ArtworkStatus) : "on_display";

  let sale_price_cents: number | null = null;
  if (body.sale_price_cents !== null && body.sale_price_cents !== undefined && body.sale_price_cents !== "") {
    const n = Number(body.sale_price_cents);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "Sale price must be a whole number of cents" };
    sale_price_cents = n;
  }

  let commission_percent: number | null = null;
  if (body.commission_percent !== null && body.commission_percent !== undefined && body.commission_percent !== "") {
    const n = Number(body.commission_percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: "Commission must be between 0 and 100 percent" };
    commission_percent = Math.round(n * 100) / 100;
  }

  return {
    ok: true,
    row: {
      title,
      artist_name,
      artist_email: text(body.artist_email),
      artist_phone: text(body.artist_phone),
      medium: text(body.medium),
      dimensions: text(body.dimensions),
      location,
      lease_start,
      lease_end,
      sale_price_cents,
      commission_percent,
      status,
      agreement_notes: text(body.agreement_notes),
    },
  };
}

// Whole days until the lease ends, negative once it has passed, null when
// open-ended. `today` is YYYY-MM-DD.
export function leaseDaysLeft(lease_end: string | null, today: string): number | null {
  if (!lease_end) return null;
  const end = Date.UTC(+lease_end.slice(0, 4), +lease_end.slice(5, 7) - 1, +lease_end.slice(8, 10));
  const now = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((end - now) / 86_400_000);
}
