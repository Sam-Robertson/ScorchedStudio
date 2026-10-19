import { test } from "node:test";
import assert from "node:assert/strict";
import { leaseDaysLeft, parseArtworkInput } from "./artwork.ts";

test("an artwork row needs a title, an artist, and a start date", () => {
  assert.deepEqual(parseArtworkInput({}), { ok: false, error: "Title is required" });
  assert.deepEqual(parseArtworkInput({ title: "Dusk" }), { ok: false, error: "Artist name is required" });
  assert.deepEqual(parseArtworkInput({ title: "Dusk", artist_name: "A" }), { ok: false, error: "Lease start must be a date" });
  assert.deepEqual(
    parseArtworkInput({ title: "Dusk", artist_name: "A", lease_start: "2026-11-01", lease_end: "2026-10-01" }),
    { ok: false, error: "Lease end must be after lease start" }
  );
});

test("blank optional fields become null and numbers are checked", () => {
  const parsed = parseArtworkInput({
    title: " Dusk ", artist_name: "A", lease_start: "2026-11-01", lease_end: "",
    artist_email: " ", sale_price_cents: "", commission_percent: "30", status: "sold", location: "slc",
  });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.row.title, "Dusk");
  assert.equal(parsed.row.lease_end, null);
  assert.equal(parsed.row.artist_email, null);
  assert.equal(parsed.row.sale_price_cents, null);
  assert.equal(parsed.row.commission_percent, 30);
  assert.equal(parsed.row.status, "sold");
  assert.equal(parsed.row.location, "slc");
  assert.equal(parseArtworkInput({ title: "D", artist_name: "A", lease_start: "2026-11-01", sale_price_cents: 12.5 }).ok, false);
  assert.equal(parseArtworkInput({ title: "D", artist_name: "A", lease_start: "2026-11-01", commission_percent: 120 }).ok, false);
  // An unknown status falls back to on display rather than failing.
  const fallback = parseArtworkInput({ title: "D", artist_name: "A", lease_start: "2026-11-01", status: "lost" });
  assert.ok(fallback.ok && fallback.row.status === "on_display");
});

test("days left on a lease counts down to zero and goes negative after", () => {
  assert.equal(leaseDaysLeft(null, "2026-10-19"), null);
  assert.equal(leaseDaysLeft("2026-10-29", "2026-10-19"), 10);
  assert.equal(leaseDaysLeft("2026-10-19", "2026-10-19"), 0);
  assert.equal(leaseDaysLeft("2026-10-01", "2026-10-19"), -18);
});
