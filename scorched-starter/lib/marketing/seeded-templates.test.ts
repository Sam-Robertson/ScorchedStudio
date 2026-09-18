// lib/marketing/seeded-templates.test.ts
//
// Guards the built-in templates in the migration against a placeholder that
// looks like a merge tag but is not one.
//
// This shipped once: the class announcement template's subject was
// "New class: {{class_name}}". Unknown tags are deliberately left alone by
// applyMergeTags, so it would have reached real inboxes as literal braces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(import.meta.dirname, "..", "..", "supabase-marketing-email-builder.sql");

// Everything applyMergeTags can actually resolve.
const SUPPORTED = ["first_name", "last_name"];

test("no seeded template uses an unsupported merge tag", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  const found = new Set<string>();
  const pattern = /\{\{\s*([a-z_]+)\s*(?:\|[^}]*)?\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) found.add(match[1].toLowerCase());

  const unsupported = Array.from(found).filter((tag) => !SUPPORTED.includes(tag));
  assert.deepEqual(
    unsupported,
    [],
    `these would ship as literal braces: ${unsupported.map((t) => `{{${t}}}`).join(", ")}`
  );
});
