// lib/square-payouts.ts — server-only
//
// Square Payouts API listing. See lib/accounting/payouts.ts for why payouts
// matter to the ledger and for the pure summarising helpers.
import { squareFetch } from "@/lib/square";
import type { SquarePayout, SquarePayoutEntry } from "@/lib/accounting/payouts";

async function listPayoutEntries(payoutId: string): Promise<SquarePayoutEntry[]> {
  const entries: SquarePayoutEntry[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
    const data = await squareFetch<{ payout_entries?: SquarePayoutEntry[]; cursor?: string }>(
      `/v2/payouts/${encodeURIComponent(payoutId)}/payout-entries?${qs}`,
      { method: "GET" }
    );
    entries.push(...(data.payout_entries ?? []));
    cursor = data.cursor;
  } while (cursor);
  return entries;
}

// PAID payouts created in [startUTC, endUTC), each with its entries. SENT
// payouts are skipped: their entries can still change, and they show up as
// PAID on a later run anyway.
export async function listPaidPayoutsWithEntries(locationId: string, startUTC: string, endUTC: string): Promise<SquarePayout[]> {
  const payouts: SquarePayout[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      location_id: locationId,
      begin_time: startUTC,
      end_time: endUTC,
      status: "PAID",
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    const data = await squareFetch<{ payouts?: SquarePayout[]; cursor?: string }>(`/v2/payouts?${qs}`, { method: "GET" });
    payouts.push(...(data.payouts ?? []));
    cursor = data.cursor;
  } while (cursor);

  for (const p of payouts) p.entries = await listPayoutEntries(p.id);
  return payouts;
}
