import test from "node:test";
import assert from "node:assert/strict";
import {
  detectColumns,
  NoPhoneColumnError,
  parseCsv,
  parseOptInDate,
  splitFullName,
  statusMeansUnsubscribed,
} from "./csv-import.ts";

// The export format from the old service is not known ahead of time, so column
// detection has to cope with whatever it turns out to be, and fail loudly
// rather than silently importing nobody.

test("parses quoted fields, embedded commas, and doubled quotes", () => {
  const rows = parseCsv('phone,name\n"+18015550000","Smith, Jane"\n"+18015550001","She said ""hi"""');
  assert.deepEqual(rows[1], ["+18015550000", "Smith, Jane"]);
  assert.deepEqual(rows[2], ["+18015550001", 'She said "hi"']);
});

test("handles CRLF line endings and a UTF-8 BOM", () => {
  // Both are near-universal in spreadsheet exports, and a BOM would otherwise
  // become part of the first header name and break detection.
  const rows = parseCsv('﻿phone,name\r\n+18015550000,Jane\r\n');
  assert.deepEqual(rows[0], ["phone", "name"]);
  assert.deepEqual(rows[1], ["+18015550000", "Jane"]);
});

test("blank trailing lines are dropped", () => {
  const rows = parseCsv("phone\n+18015550000\n\n\n");
  assert.equal(rows.length, 2);
});

test("finds a phone column under the many names an export might use", () => {
  for (const header of ["phone", "Phone", "mobile", "Mobile Number", "phone_number", "Cell", "MSISDN"]) {
    const cols = detectColumns([header, "other"]);
    assert.equal(cols.phone, 0, `failed to detect ${header}`);
  }
});

test("an exact header match beats a partial one", () => {
  // "phone" should win over "phone_carrier_lookup" even though both contain it.
  const cols = detectColumns(["phone_carrier_lookup", "phone"]);
  assert.equal(cols.phone, 1);
});

test("missing a phone column fails with the headers it actually found", () => {
  try {
    detectColumns(["first_name", "last_name", "signup_date"]);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof NoPhoneColumnError);
    // The message has to name the real headers, or Sam cannot fix the command.
    assert.match(err.message, /first_name/);
    assert.match(err.message, /signup_date/);
    assert.match(err.message, /--phone-col/);
  }
});

test("an explicit override wins over detection", () => {
  const cols = detectColumns(["phone", "backup_line"], { phone: "backup_line" });
  assert.equal(cols.phone, 1);
});

test("an override naming a header that is not there fails clearly", () => {
  assert.throws(
    () => detectColumns(["phone"], { phone: "mobile" }),
    /does not match any header/
  );
});

test("name, date and status columns are detected independently", () => {
  const cols = detectColumns(["Mobile", "First Name", "Last Name", "Opt-In Date", "Status", "Email"]);
  assert.equal(cols.phone, 0);
  assert.equal(cols.firstName, 1);
  assert.equal(cols.lastName, 2);
  assert.equal(cols.date, 3);
  assert.equal(cols.status, 4);
  assert.equal(cols.email, 5);
});

test("absent optional columns report as -1 rather than guessing", () => {
  const cols = detectColumns(["phone"]);
  assert.equal(cols.firstName, -1);
  assert.equal(cols.date, -1);
  assert.equal(cols.status, -1);
});

test("a single name column is split into first and last", () => {
  assert.deepEqual(splitFullName("Jane Smith"), { firstName: "Jane", lastName: "Smith" });
  assert.deepEqual(splitFullName("Jane Q Smith"), { firstName: "Jane", lastName: "Q Smith" });
  assert.deepEqual(splitFullName("Cher"), { firstName: "Cher", lastName: null });
  assert.deepEqual(splitFullName("   "), { firstName: null, lastName: null });
});

test("opt-in dates parse from the formats an old export is likely to use", () => {
  assert.equal(parseOptInDate("2024-03-15")?.slice(0, 10), "2024-03-15");
  assert.equal(parseOptInDate("2024-03-15T10:30:00Z")?.slice(0, 10), "2024-03-15");
  // US-style is read month-first, explicitly, rather than left to Date's guess.
  assert.equal(parseOptInDate("3/15/2024")?.slice(0, 10), "2024-03-15");
  assert.equal(parseOptInDate("03/15/24")?.slice(0, 10), "2024-03-15");
});

test("an unparseable date returns null instead of an invented one", () => {
  // The caller falls back to the import time rather than recording a date that
  // never happened.
  assert.equal(parseOptInDate("not a date"), null);
  assert.equal(parseOptInDate(""), null);
  assert.equal(parseOptInDate(null), null);
  // A spreadsheet serial number would parse to year 1899 or similar.
  assert.equal(parseOptInDate("45000"), null);
});

test("opt-out statuses are recognised across the wordings services use", () => {
  for (const status of [
    "unsubscribed", "Unsubscribed", "opted out", "OPTED OUT", "optout",
    "inactive", "stopped", "removed", "false", "no", "0",
  ]) {
    assert.ok(statusMeansUnsubscribed(status), `${status} should mean unsubscribed`);
  }
});

test("active statuses are not mistaken for opt-outs", () => {
  for (const status of ["subscribed", "active", "true", "yes", "1", "confirmed", ""]) {
    assert.ok(!statusMeansUnsubscribed(status), `${status} should not mean unsubscribed`);
  }
  assert.ok(!statusMeansUnsubscribed(null));
});
