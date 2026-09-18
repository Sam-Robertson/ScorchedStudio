// scripts/import-legacy-sms.ts
//
// One-off import of the legacy SMS list (the "text BURN to (844) 952-0456"
// list) into subscribers.
//
// Requires TWO exports from the old service: the active subscribers and the
// opt-out list. The opt-out list is imported first and always wins, so someone
// who left can never be reactivated by appearing on a stale active export.
//
// Writes nothing unless --apply is passed. The only Supabase credentials on
// this machine are production, so a bare invocation must be safe.
//
//   pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv
//   pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv --apply
//
// Column headers are auto-detected. Override with --phone-col, --date-col,
// --status-col, --first-name-col, --last-name-col, --email-col.
import { readFileSync } from "node:fs";
import { getSupabase } from "../lib/supabase.ts";
import { normalizePhone } from "../lib/marketing/phone.ts";
import {
  detectColumns,
  NoPhoneColumnError,
  parseCsv,
  parseOptInDate,
  splitFullName,
  statusMeansUnsubscribed,
  type ColumnOverrides,
} from "../lib/marketing/csv-import.ts";

const LEGACY_SERVICE_NAME = "the previous SMS marketing service (BURN keyword short code)";
const CONSENT_TEXT =
  `Imported from ${LEGACY_SERVICE_NAME}. This person opted in there by texting the BURN keyword ` +
  `to the studio's previous number. The exact wording shown to them at the time was not recorded by that service.`;

const IMPORT_TAG = "legacy-sms";
// The first message this segment gets. They last heard from a different
// number, so it has to say who it is before anything else, and it has to fit
// in one segment: a multi-part re-introduction from an unknown number is
// exactly what gets reported as spam. Straight apostrophes only, since a curly
// one would force UCS-2 and halve the usable length.
export const REINTRO_MESSAGE =
  "Scorched Studio here! This is our new number for class updates and offers. " +
  "Save it so you don't miss out. Reply STOP to opt out.";

type Row = {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  optInDate: string | null;
  unsubscribed: boolean;
};

type Counts = {
  read: number;
  valid: number;
  invalidPhone: number;
  duplicateInFile: number;
  optedOut: number;
};

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function overrides(): ColumnOverrides {
  return {
    phone: arg("phone-col"),
    date: arg("date-col"),
    status: arg("status-col"),
    firstName: arg("first-name-col"),
    lastName: arg("last-name-col"),
    email: arg("email-col"),
  };
}

function readList(path: string, forceUnsubscribed: boolean): { rows: Row[]; counts: Counts } {
  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length === 0) throw new Error(`${path} is empty`);

  const headers = rows[0];
  const cols = detectColumns(headers, overrides());

  const counts: Counts = { read: 0, valid: 0, invalidPhone: 0, duplicateInFile: 0, optedOut: 0 };
  const seen = new Set<string>();
  const out: Row[] = [];

  for (const raw of rows.slice(1)) {
    counts.read++;

    const phone = normalizePhone(raw[cols.phone] ?? "");
    if (!phone) {
      counts.invalidPhone++;
      continue;
    }
    if (seen.has(phone)) {
      counts.duplicateInFile++;
      continue;
    }
    seen.add(phone);

    let firstName = cols.firstName !== -1 ? raw[cols.firstName]?.trim() || null : null;
    let lastName = cols.lastName !== -1 ? raw[cols.lastName]?.trim() || null : null;
    if (!firstName && !lastName && cols.fullName !== -1) {
      const split = splitFullName(raw[cols.fullName] ?? "");
      firstName = split.firstName;
      lastName = split.lastName;
    }

    // A status column on the active export can still mark someone as gone.
    const unsubscribed =
      forceUnsubscribed || (cols.status !== -1 && statusMeansUnsubscribed(raw[cols.status]));
    if (unsubscribed) counts.optedOut++;

    out.push({
      phone,
      firstName,
      lastName,
      email: cols.email !== -1 ? raw[cols.email]?.trim().toLowerCase() || null : null,
      optInDate: cols.date !== -1 ? parseOptInDate(raw[cols.date]) : null,
      unsubscribed,
    });
    counts.valid++;
  }

  return { rows: out, counts };
}

async function importRows(rows: Row[], apply: boolean): Promise<{ inserted: number; updated: number }> {
  const sb = getSupabase();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const { data: existing, error: lookupError } = await sb
      .from("subscribers")
      .select("*")
      .eq("phone", row.phone)
      .maybeSingle();
    if (lookupError) throw new Error(`lookup failed for ${row.phone}: ${lookupError.message}`);

    const smsStatus = row.unsubscribed ? "unsubscribed" : "subscribed";

    if (!apply) {
      if (existing) updated++;
      else inserted++;
      continue;
    }

    let subscriberId: string;

    if (existing) {
      // An opt-out already recorded here outranks anything in the file. Someone
      // who texted STOP to the new number must not come back subscribed.
      const keepUnsubscribed = existing.sms_status === "unsubscribed" || row.unsubscribed;
      const { data, error } = await sb
        .from("subscribers")
        .update({
          sms_status: keepUnsubscribed ? "unsubscribed" : "subscribed",
          first_name: existing.first_name ?? row.firstName,
          last_name: existing.last_name ?? row.lastName,
          tags: Array.from(new Set([...(existing.tags ?? []), IMPORT_TAG])),
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(`update failed for ${row.phone}: ${error.message}`);
      subscriberId = data.id;
      updated++;
    } else {
      const { data, error } = await sb
        .from("subscribers")
        .insert({
          phone: row.phone,
          email: row.email,
          first_name: row.firstName,
          last_name: row.lastName,
          sms_status: smsStatus,
          tags: [IMPORT_TAG],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insert failed for ${row.phone}: ${error.message}`);
      subscriberId = data.id;
      inserted++;
    }

    const { error: consentError } = await sb.from("consent_events").insert({
      subscriber_id: subscriberId,
      channel: "sms",
      action: row.unsubscribed ? "opt_out" : "opt_in",
      source: "import_legacy_sms",
      consent_text: CONSENT_TEXT,
      // The original opt-in date when the export carried one, so the record
      // reflects when they actually agreed rather than when we imported them.
      occurred_at: row.optInDate ?? new Date().toISOString(),
    });
    if (consentError) throw new Error(`consent log failed for ${row.phone}: ${consentError.message}`);
  }

  return { inserted, updated };
}

// Provider contact sync.
//
// Telnyx has no contact list: you send to a number, and its opt-out list is
// populated automatically from inbound STOP keywords. So there is nothing to
// push, and Supabase is the only store this script writes.
function reportProviderSync(rows: Row[], apply: boolean): void {
  const optedOut = rows.filter((r) => r.unsubscribed).length;
  console.log(
    `  Telnyx: no contact list to sync, so ${apply ? "nothing was pushed" : "nothing would be pushed"}. ` +
      `${rows.length - optedOut} subscribed and ${optedOut} opted out recorded in Supabase only.`
  );
  console.log(
    "  Note: Telnyx's own opt-out list starts empty. Anyone on the legacy opt-out list is " +
      "unsubscribed here, which is what stops them being enqueued in the first place."
  );
}

function report(label: string, counts: Counts) {
  console.log(`\n${label}`);
  console.log(`  rows read:          ${counts.read}`);
  console.log(`  valid:              ${counts.valid}`);
  console.log(`  invalid phone:      ${counts.invalidPhone}`);
  console.log(`  duplicate in file:  ${counts.duplicateInFile}`);
  console.log(`  marked opted out:   ${counts.optedOut}`);
}

async function main() {
  const activePath = arg("active");
  const optOutPath = arg("opt-out");
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;

  if (!activePath || !optOutPath) {
    console.error(
      "Both exports are required.\n\n" +
        "  --active   <path>  CSV of current subscribers\n" +
        "  --opt-out  <path>  CSV of unsubscribed people\n\n" +
        "The opt-out list is not optional: without it, people who left the old\n" +
        "list would be imported as subscribed and texted again.\n\n" +
        "Add --apply to write. Without it this is a dry run."
    );
    process.exit(1);
  }

  const optOut = readList(optOutPath, true);
  const active = readList(activePath, false);

  report("Opt-out list", optOut.counts);
  report("Active list", active.counts);

  // Opt-outs are applied first and are never overwritten by the active list.
  const byPhone = new Map<string, Row>();
  for (const row of optOut.rows) byPhone.set(row.phone, { ...row, unsubscribed: true });
  for (const row of active.rows) {
    const existing = byPhone.get(row.phone);
    if (existing?.unsubscribed) continue; // never revive someone who opted out
    byPhone.set(row.phone, row);
  }

  const merged = [...byPhone.values()];
  const willSubscribe = merged.filter((r) => !r.unsubscribed).length;

  console.log(`\nCombined`);
  console.log(`  unique people:      ${merged.length}`);
  console.log(`  will be subscribed: ${willSubscribe}`);
  console.log(`  will be unsubscribed: ${merged.length - willSubscribe}`);

  if (dryRun) {
    reportProviderSync(merged, false);
    console.log("\nDRY RUN. Nothing was written. Re-run with --apply to import.");
    return;
  }

  console.log("\nWriting to Supabase...");
  const { inserted, updated } = await importRows(merged, true);
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);

  console.log("\nSMS provider contact sync:");
  reportProviderSync(merged, true);

  console.log(
    `\nDone. Suggested first message to this segment, which fits in a single\n` +
      `GSM-7 segment and needs no emoji:\n\n  ${REINTRO_MESSAGE}\n\n` +
      `Create it as a campaign tagged "${IMPORT_TAG}". The admin page shows the\n` +
      `recipient count, the segment count, and the estimated cost before you send.`
  );
}

main().catch((err) => {
  if (err instanceof NoPhoneColumnError) {
    console.error(err.message);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
