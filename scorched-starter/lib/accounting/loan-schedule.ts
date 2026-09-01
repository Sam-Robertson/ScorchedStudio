// lib/accounting/loan-schedule.ts — server-only
//
// Generates a declining-balance amortization schedule from a loan's actual
// terms (not the other way around — real lender payment amounts often
// don't match a textbook annuity formula exactly, e.g. LiftFund's $574.66
// on $21,000/18%/54mo computes to ~$570.16 by formula, likely due to fees
// rolled into the note). We use the lender's stated fixed payment and let
// the schedule pay the loan off whenever the balance reaches zero, which
// can be before `termMonths` if the payment is above the exact breakeven.
export type ScheduleRow = {
  period: number;
  dueDate: string; // YYYY-MM-DD
  payment: number;
  principal: number;
  interest: number;
  balanceAfter: number;
};

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateAmortizationSchedule(opts: {
  principal: number;
  annualRate: number;
  termMonths: number;
  monthlyPayment: number;
  firstDueDate: string; // YYYY-MM-DD
}): ScheduleRow[] {
  const monthlyRate = opts.annualRate / 12;
  const rows: ScheduleRow[] = [];
  let balance = opts.principal;

  for (let period = 1; period <= opts.termMonths && balance > 0.005; period++) {
    const interest = round2(balance * monthlyRate);
    let payment = opts.monthlyPayment;
    let principal = round2(payment - interest);

    if (principal >= balance) {
      principal = round2(balance);
      payment = round2(principal + interest);
    }

    balance = round2(balance - principal);

    rows.push({
      period,
      dueDate: addMonths(opts.firstDueDate, period - 1),
      payment,
      principal,
      interest,
      balanceAfter: balance,
    });
  }

  return rows;
}

// Matches a real bank payment to the nearest not-yet-paid schedule row by
// due date, rather than "the next row in period order" — a loan's earliest
// periods can predate this system's Plaid transaction history (LiftFund's
// period 1 was due 2026-05-15, three weeks before our bank feed starts), so
// the first *observed* payment is not necessarily period 1.
export function findNearestUnpaidRow<T extends { dueDate: string; status: string }>(
  rows: T[],
  txnDate: string,
  maxDaysApart = 20
): T | null {
  const txnTime = new Date(txnDate + "T00:00:00Z").getTime();
  let best: T | null = null;
  let bestDiff = Infinity;

  for (const row of rows) {
    if (row.status !== "scheduled") continue;
    const diff = Math.abs(new Date(row.dueDate + "T00:00:00Z").getTime() - txnTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }

  const maxMs = maxDaysApart * 24 * 60 * 60 * 1000;
  return bestDiff <= maxMs ? best : null;
}
