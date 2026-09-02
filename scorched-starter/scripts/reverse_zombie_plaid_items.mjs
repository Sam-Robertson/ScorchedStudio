import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const oldIds = [
  "016e5797-a803-45f4-a399-65bae56b19a7",
  "314a2595-526b-48ff-b4a4-2a843b455f17",
  "d0135b93-6e0c-424d-9087-852376cf6f40",
  "fd836f9c-a8af-47ff-9b16-737bbb8c7875",
  "8911d353-ce5f-4095-8c96-4fe0f08cd1a8",
  "320adc11-4cca-49ed-a178-95adfc9beb9b",
];

const { data: rows, error: fetchErr } = await sb
  .from("bank_transactions")
  .select("id,status,journal_entry_id")
  .in("bank_account_id", oldIds);
if (fetchErr) throw fetchErr;

const journalIds = rows.filter((r) => r.journal_entry_id).map((r) => r.journal_entry_id);
const CHUNK = 100;

// bank_transactions.journal_entry_id FKs to journal_entries, so it must be
// cleared before the entries can be deleted.
const toIgnore = rows.filter((r) => r.status === "posted" || r.status === "unreviewed").map((r) => r.id);
console.log("marking", toIgnore.length, "bank_transactions as ignored...");
for (let i = 0; i < toIgnore.length; i += CHUNK) {
  const chunk = toIgnore.slice(i, i + CHUNK);
  const { error: updErr } = await sb
    .from("bank_transactions")
    .update({ status: "ignored", journal_entry_id: null, rule_id: null })
    .in("id", chunk);
  if (updErr) throw updErr;
}

console.log("deleting", journalIds.length, "journal entries...");
for (let i = 0; i < journalIds.length; i += CHUNK) {
  const chunk = journalIds.slice(i, i + CHUNK);
  const { error: delErr } = await sb.from("journal_entries").delete().in("id", chunk);
  if (delErr) throw delErr;
}

console.log("done.");
