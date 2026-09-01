// One-time seed: registers the LiftFund loan (§ spec: funded 2026-04-01,
// $21,000, 18%, 54 months, $574.66/mo) and its amortization schedule, then
// points the existing "Liftfund.*Loan Pmt" bank rule at loan_payment so the
// three already-synced payments (6/15, 7/15, 8/17) get reclassified out of
// the inbox on the next classify pass.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { generateAmortizationSchedule } from "../lib/accounting/loan-schedule.ts";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: existing } = await sb.from("loans").select("id").eq("name", "LiftFund").maybeSingle();
  if (existing) {
    console.log("LiftFund loan already registered:", existing.id);
    return;
  }

  const { data: loan, error: loanErr } = await sb
    .from("loans")
    .insert({
      name: "LiftFund",
      liability_account_code: "2500",
      principal: 21000,
      annual_rate: 0.18,
      term_months: 54,
      monthly_payment: 574.66,
      funded_date: "2026-04-01",
    })
    .select("id")
    .single();
  if (loanErr) throw loanErr;
  console.log("inserted loan", loan.id);

  const rows = generateAmortizationSchedule({
    principal: 21000,
    annualRate: 0.18,
    termMonths: 54,
    monthlyPayment: 574.66,
    firstDueDate: "2026-05-15",
  });

  const { error: scheduleErr } = await sb.from("loan_schedule").insert(
    rows.map((r) => ({
      loan_id: loan.id,
      period: r.period,
      due_date: r.dueDate,
      payment: r.payment,
      principal: r.principal,
      interest: r.interest,
      balance_after: r.balanceAfter,
    }))
  );
  if (scheduleErr) throw scheduleErr;
  console.log("inserted", rows.length, "schedule rows");

  const { data: liabilityAccount, error: acctErr } = await sb
    .from("accounts")
    .select("id")
    .eq("code", "2500")
    .single();
  if (acctErr) throw acctErr;

  const { error: ruleErr } = await sb
    .from("categorization_rules")
    .update({ template: "loan_payment", target_account_id: liabilityAccount.id, loan_id: loan.id })
    .ilike("match_regex", "%Liftfund%Loan Pmt%");
  if (ruleErr) throw ruleErr;
  console.log("Liftfund.*Loan Pmt rule now posts loan_payment against loan", loan.id);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
