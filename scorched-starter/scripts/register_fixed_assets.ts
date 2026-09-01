// One-time: registers the truck and Bluetti power stations. Neither
// appears in the synced bank feed (both predate the 2026-06-03 Plaid
// history start), so cost is the user's own estimate and in-service date
// is reasoned from context (LiftFund funded 2026-04-01 as a startup loan;
// these are classic startup capex, most likely acquired at/near funding) —
// both are placeholders the user should correct with exact figures if
// they turn up receipts. The ~$100 security system is NOT registered here:
// it's below any sane capitalization threshold and gets expensed instead
// (see categorization_rules for SP ALSECUREINC, the recurring monitoring
// charge that IS in the feed).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const assets = [
    { description: "Truck (estimate — not in synced bank history, cost/date unverified)", cost: 14000, in_service_date: "2026-04-01", useful_life_months: 60 },
    { description: "Bluetti power stations (estimate — not in synced bank history, cost/date unverified)", cost: 1500, in_service_date: "2026-04-01", useful_life_months: 60 },
  ];

  for (const asset of assets) {
    const { data: existing } = await sb.from("fixed_assets").select("id").eq("description", asset.description).maybeSingle();
    if (existing) {
      console.log("already registered:", asset.description, existing.id);
      continue;
    }
    const { data, error } = await sb.from("fixed_assets").insert(asset).select("id").single();
    if (error) throw error;
    console.log("registered:", asset.description, data.id);
  }

  // ALSECUREINC: recurring security monitoring charge, real transaction in
  // the feed (2026-08-08, $329) — expense, not capex.
  const { data: bankFeesAccount, error: acctErr } = await sb.from("accounts").select("id").eq("code", "6900").single();
  if (acctErr) throw acctErr;

  const { data: existingRule } = await sb
    .from("categorization_rules")
    .select("id")
    .ilike("match_regex", "%ALSECUREINC%")
    .maybeSingle();
  if (existingRule) {
    console.log("ALSECUREINC rule already exists:", existingRule.id);
  } else {
    const { data: rule, error: ruleErr } = await sb
      .from("categorization_rules")
      .insert({
        priority: 40,
        match_field: "name",
        match_regex: "ALSECUREINC",
        direction: "debit",
        template: "expense",
        target_account_id: bankFeesAccount.id,
        active: true,
      })
      .select("id")
      .single();
    if (ruleErr) throw ruleErr;
    console.log("inserted ALSECUREINC rule:", rule.id);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
