// lib/plaid.ts — server-only, never import in client components
//
// Thin wrapper around Plaid's REST API, in the same style as lib/square.ts
// (hand-rolled fetch, not the official Node SDK — keeps this consistent
// with how the rest of the app talks to third-party APIs and avoids a
// heavier dependency for a handful of endpoints).
import { getSupabase } from "@/lib/supabase";
import { decryptToken, encryptToken, fromPgBytea, toPgBytea } from "@/lib/accounting/encryption";

function plaidBaseUrl() {
  return process.env.PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";
}

async function plaidFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET");

  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PLAID_API_ERROR ${res.status} ${json.error_code ?? ""}: ${json.error_message ?? JSON.stringify(json)}`);
  }
  return json as T;
}

export async function createLinkToken(userId: string): Promise<{ link_token: string; expiration: string }> {
  return plaidFetch("/link/token/create", {
    user: { client_user_id: userId },
    client_name: "Scorched Studio Accounting",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  });
}

type PlaidExchangeResponse = { access_token: string; item_id: string };

export async function exchangePublicToken(publicToken: string): Promise<PlaidExchangeResponse> {
  return plaidFetch("/item/public_token/exchange", { public_token: publicToken });
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;    // 'depository' | 'credit' | ...
  subtype: string | null;
  balances: { current: number | null; available: number | null; iso_currency_code: string | null };
};

export async function getAccounts(accessToken: string): Promise<{ accounts: PlaidAccount[]; item: { institution_id: string | null } }> {
  return plaidFetch("/accounts/get", { access_token: accessToken });
}

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  category: string[] | null;
  pending: boolean;
};

export type SyncResult = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
};

export async function syncTransactions(accessToken: string, cursor: string | null): Promise<SyncResult> {
  return plaidFetch("/transactions/sync", { access_token: accessToken, cursor: cursor ?? undefined, count: 500 });
}

// Convenience wrapper: fetch the access token for a stored plaid_item and
// decrypt it. Callers must not log or return the result.
export async function getDecryptedAccessToken(plaidItemId: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.from("plaid_items").select("access_token_enc").eq("id", plaidItemId).single();
  if (error || !data) throw new Error(`Unknown plaid_item ${plaidItemId}`);
  return decryptToken(fromPgBytea(data.access_token_enc));
}

export { encryptToken, toPgBytea };
