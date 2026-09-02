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

// These were ignored in error a moment ago (mistakenly treated as duplicate
// data). None were deleted — only their journal_entry_id/status changed —
// so resetting to unreviewed lets the normal classification sweep
// regenerate the same postings from the same still-intact active rules.
// Filter to rule_id IS NULL: the reversal script cleared rule_id only on the
// rows it touched, so this excludes the small number that were legitimately
// already ignored beforehand (e.g. real card-payment mirrors), which still
// carry their original ignore-rule's rule_id.
const { data: rows, error } = await sb
  .from("bank_transactions")
  .select("id")
  .in("bank_account_id", oldIds)
  .eq("status", "ignored")
  .is("rule_id", null);
if (error) throw error;

console.log("resetting", rows.length, "bank_transactions to unreviewed...");
const CHUNK = 100;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK).map((r) => r.id);
  const { error: updErr } = await sb.from("bank_transactions").update({ status: "unreviewed" }).in("id", chunk);
  if (updErr) throw updErr;
}
console.log("done — run the classify sweep next.");
