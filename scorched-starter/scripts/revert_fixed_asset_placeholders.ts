// Reverses the truck/Bluetti placeholder registration. Cost, in-service
// date, and funding source were all estimates/inferences, not observed
// transactions or user-confirmed facts — unlike the LiftFund loan entry
// (every number there came from the spec, user-approved), this was
// synthesized data that made 1000 Chase Checking go negative once posted.
// Deletes the capex and depreciation journal entries, the depreciation_runs
// row, and the fixed_assets rows. The register/job code stays — only the
// fabricated data comes out. Register these again once the user provides
// real cost, in-service date, and payment account.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CAPEX_ENTRY_ID = "0d9df94b-10b5-4315-9a8b-9e2c3d4ea1ce";
const DEPRECIATION_ENTRY_ID = "77ab8cd7-70ce-4ec5-8cf5-a25f3910bd06";

async function main() {
  // depreciation_runs and fixed_assets don't FK to journal_entries with a
  // blocking constraint the way bank_transactions does, but clear the
  // journal_entry_id references first regardless, then delete entries.
  const { error: runErr } = await sb.from("depreciation_runs").delete().eq("journal_entry_id", DEPRECIATION_ENTRY_ID);
  if (runErr) throw runErr;
  console.log("deleted depreciation_runs row");

  const { error: entriesErr } = await sb.from("journal_entries").delete().in("id", [CAPEX_ENTRY_ID, DEPRECIATION_ENTRY_ID]);
  if (entriesErr) throw entriesErr;
  console.log("deleted 2 journal entries (capex + depreciation)");

  const { data: assets, error: assetsErr } = await sb.from("fixed_assets").select("id, description");
  if (assetsErr) throw assetsErr;
  const { error: delAssetsErr } = await sb.from("fixed_assets").delete().in("id", assets.map((a) => a.id));
  if (delAssetsErr) throw delAssetsErr;
  console.log("deleted fixed_assets rows:", assets.map((a) => a.description));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
