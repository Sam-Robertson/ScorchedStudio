// The monthly Sales Summary backfill posted a whole-June entry
// (square:orem:2026-06-01) that double-counts against real daily Square
// entries already posted for 2026-06-03 onward (Square's own API history
// isn't limited to Plaid's 90-day window the way Plaid is, so the Phase 3
// daily backfill already covers June). July was correctly skipped by the
// idempotency check for the same reason; April and May have no daily data
// to conflict with, so those two stay.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: row, error } = await sb
    .from("revenue_settlements")
    .select("id, journal_entry_id")
    .eq("provider_key", "square:orem:2026-06-01")
    .single();
  if (error) throw error;

  const { error: delSettlementErr } = await sb.from("revenue_settlements").delete().eq("id", row.id);
  if (delSettlementErr) throw delSettlementErr;

  const { error: delEntryErr } = await sb.from("journal_entries").delete().eq("id", row.journal_entry_id);
  if (delEntryErr) throw delEntryErr;

  console.log("removed duplicate June monthly settlement and its journal entry:", row.journal_entry_id);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
