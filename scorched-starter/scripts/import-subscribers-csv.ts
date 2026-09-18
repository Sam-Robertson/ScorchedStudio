// scripts/import-subscribers-csv.ts
//
// Imports the combined Omnisend/Klaviyo export, which carries both channels in
// one file with a status column each:
//
//   email,first_name,last_name,phone,email_marketing,sms_marketing,
//   email_opt_in_date,sources,review_notes
//
// This is a different shape from import-legacy-sms.ts, which expects two
// SMS-only files (an active list and an opt-out list) and one status column.
// Both are kept: they read different exports.
//
// Dry run by default. Pass --apply to write.
//
//   pnpm tsx scripts/import-subscribers-csv.ts <file.csv>
//   pnpm tsx scripts/import-subscribers-csv.ts <file.csv> --apply
import { readFileSync } from "node:fs";
import { loadEnv } from "./load-env.ts";

loadEnv();

import { normalizePhone } from "../lib/marketing/phone.ts";
import { parseCsv } from "../lib/marketing/csv-import.ts";
import { recordConsent } from "../lib/marketing/consent.ts";

const IMPORT_TAG = "legacy-import";

// Three states, not two. "unknown" is the important one: it is the absence of a
// record, not a yes, and it must never become a subscription. Texting 90 people
// whose consent nobody can evidence is the single most damaging thing this
// system could do, and it is exactly what a carrier audit looks for.
type Flag = "yes" | "no" | "unknown";

function flag(raw: string | undefined): Flag {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "subscribed") return "yes";
  if (v === "no" || v === "false" || v === "unsubscribed") return "no";
  return "unknown";
}

function consentTextFor(channel: "email" | "sms", sources: string, optIn: boolean, date: string) {
  const where = sources.trim() || "a previous marketing platform";
  return optIn
    ? `Imported from ${where}. This person was recorded there as opted in to ${channel} marketing. ` +
        `The export carried ${date ? `an opt-in date of ${date}` : "no opt-in date"}, and no record of the ` +
        `wording they were originally shown. Imported into Scorched Studio's own list on ${new Date()
          .toISOString()
          .slice(0, 10)}.`
    : `Imported from ${where}, where this person was recorded as NOT subscribed to ${channel} marketing. ` +
        `Recorded as an opt-out so the status cannot be undone by a later import.`;
}

type Row = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  rawPhone: string;
  emailFlag: Flag;
  smsFlag: Flag;
  optInDate: string;
  sources: string;
  notes: string;
};

function readRows(path: string): { rows: Row[]; skipped: { reason: string; line: number }[] } {
  const parsed = parseCsv(readFileSync(path, "utf8"));
  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const required = ["email", "phone", "email_marketing", "sms_marketing"];
  for (const col of required) {
    if (idx(col) === -1) {
      throw new Error(`Missing column "${col}". Headers found: ${parsed[0].join(", ")}`);
    }
  }

  const rows: Row[] = [];
  const skipped: { reason: string; line: number }[] = [];

  parsed.slice(1).forEach((r, i) => {
    const email = (r[idx("email")] ?? "").trim().toLowerCase();
    const rawPhone = (r[idx("phone")] ?? "").trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    // subscribers requires at least one of email or phone, and a phone we
    // cannot normalize is not one.
    if (!email && !phone) {
      skipped.push({ reason: rawPhone ? "phone unusable, no email" : "no email and no phone", line: i + 2 });
      return;
    }

    rows.push({
      email,
      firstName: (r[idx("first_name")] ?? "").trim(),
      lastName: (r[idx("last_name")] ?? "").trim(),
      phone,
      rawPhone,
      emailFlag: flag(r[idx("email_marketing")]),
      smsFlag: flag(r[idx("sms_marketing")]),
      optInDate: (r[idx("email_opt_in_date")] ?? "").trim(),
      sources: (r[idx("sources")] ?? "").trim(),
      notes: (r[idx("review_notes")] ?? "").trim(),
    });
  });

  return { rows, skipped };
}

async function main() {
  const path = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!path || path.startsWith("--")) {
    console.error("Usage: pnpm tsx scripts/import-subscribers-csv.ts <file.csv> [--apply]");
    process.exit(1);
  }

  const { rows, skipped } = readRows(path);

  const emailIn = rows.filter((r) => r.email && r.emailFlag === "yes").length;
  const emailOut = rows.filter((r) => r.email && r.emailFlag === "no").length;
  const emailUnknown = rows.filter((r) => r.email && r.emailFlag === "unknown").length;
  const smsIn = rows.filter((r) => r.phone && r.smsFlag === "yes").length;
  const smsOut = rows.filter((r) => r.phone && r.smsFlag === "no").length;
  const smsUnknown = rows.filter((r) => r.smsFlag === "unknown").length;
  const smsYesNoPhone = rows.filter((r) => !r.phone && r.smsFlag === "yes").length;
  const badPhones = rows.filter((r) => r.rawPhone && !r.phone).length;

  console.log(`\nRead ${rows.length} usable rows from ${path}`);
  if (skipped.length) console.log(`  skipped ${skipped.length}: ${skipped.map((s) => `line ${s.line} (${s.reason})`).join(", ")}`);

  console.log(`\nEmail`);
  console.log(`  will subscribe:    ${emailIn}`);
  console.log(`  will unsubscribe:  ${emailOut}`);
  console.log(`  no status, left alone: ${emailUnknown}`);

  console.log(`\nText messages`);
  console.log(`  will subscribe:    ${smsIn}`);
  console.log(`  will unsubscribe:  ${smsOut}`);
  console.log(`  "unknown", NOT subscribed: ${smsUnknown}`);
  if (smsYesNoPhone) console.log(`  marked yes but no usable phone: ${smsYesNoPhone}`);
  if (badPhones) console.log(`  phone present but unusable: ${badPhones}`);

  if (!apply) {
    console.log(`\nDRY RUN. Nothing was written. Re-run with --apply to import.\n`);
    return;
  }

  console.log(`\nWriting to Supabase...`);
  let emailWrites = 0;
  let smsWrites = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const name = { firstName: row.firstName || null, lastName: row.lastName || null };
    // Imports carry the original opt-in date when the export had one, so the
    // record reflects when they agreed rather than when we loaded the file.
    const occurredAt = row.optInDate ? new Date(`${row.optInDate}T12:00:00Z`).toISOString() : null;

    try {
      // Two calls rather than one, so each consent row carries the source that
      // is actually true for that channel instead of a single blended label.
      if (row.email && row.emailFlag !== "unknown") {
        await recordConsent({
          email: row.email,
          ...name,
          channels: [{ channel: "email", optIn: row.emailFlag === "yes" }],
          source: "import_legacy_newsletter",
          consentText: consentTextFor("email", row.sources, row.emailFlag === "yes", row.optInDate),
          occurredAt,
          tags: [IMPORT_TAG],
        });
        emailWrites++;
      }

      if (row.phone && row.smsFlag !== "unknown") {
        await recordConsent({
          email: row.email || null,
          phone: row.phone,
          ...name,
          channels: [{ channel: "sms", optIn: row.smsFlag === "yes" }],
          source: "import_legacy_sms",
          consentText: consentTextFor("sms", row.sources, row.smsFlag === "yes", row.optInDate),
          occurredAt,
          tags: [IMPORT_TAG],
        });
        smsWrites++;
      }

      // Someone with a phone but no recorded SMS status still belongs on the
      // list, so they exist for a future opt-in; they are simply not subscribed
      // on that channel.
      if (row.email && row.emailFlag === "unknown" && row.smsFlag === "unknown") {
        await recordConsent({
          email: row.email,
          ...name,
          channels: [],
          source: "import_legacy_newsletter",
          consentText: consentTextFor("email", row.sources, false, row.optInDate),
          occurredAt,
          tags: [IMPORT_TAG],
        });
      }
    } catch (err) {
      failures.push(`${row.email || row.phone}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`  email consent rows: ${emailWrites}`);
  console.log(`  sms consent rows:   ${smsWrites}`);
  if (failures.length) {
    console.log(`\n  ${failures.length} failed:`);
    failures.slice(0, 20).forEach((f) => console.log(`    ${f}`));
  }
  console.log(
    `\nDone. Everything imported is tagged "${IMPORT_TAG}", so it can be found, segmented, or removed as a set.\n`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
