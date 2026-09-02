import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Bug from an earlier run of a similar script: this must read `env.PLAID_ENV`
// (the parsed .env value), not `process.env.PLAID_ENV` (never set here) —
// that earlier bug silently defaulted to sandbox and made /item/remove fail
// with an opaque "invalid client_id" against production credentials.
function plaidBaseUrl() {
  return env.PLAID_ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
}

async function plaidFetch(path, body) {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PLAID_API_ERROR ${res.status} ${json.error_code ?? ""}: ${json.error_message ?? JSON.stringify(json)}`);
  return json;
}

function decryptToken(stored) {
  const key = Buffer.from(env.PLAID_TOKEN_ENC_KEY, "hex");
  const iv = stored.subarray(0, 12);
  const authTag = stored.subarray(12, 28);
  const ciphertext = stored.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
function fromPgBytea(pgHex) {
  return Buffer.from(pgHex.replace(/^\\x/, ""), "hex");
}

// These are the connections confirmed stale (no real activity since
// May/June 2026, per a live /item/get + bank_transactions date check) —
// NOT the "old" set from the earlier (mistaken) investigation. bank_accounts
// for these have already been flipped to active=false.
const staleItemIds = [
  "3bf701ea-9ba8-4f2d-a200-7a092ee6916b", // American Express (stale)
  "bc6c728b-e6ad-466d-9ce1-62a27664962a", // Chase (stale)
  "9508b014-7a9f-47ff-8154-463f300b46f4", // U.S. Bank (stale)
];

for (const id of staleItemIds) {
  const { data: item, error } = await sb.from("plaid_items").select("id, item_id, institution_name, access_token_enc").eq("id", id).single();
  if (error || !item) { console.error("not found", id, error?.message); continue; }

  try {
    const accessToken = decryptToken(fromPgBytea(item.access_token_enc));
    await plaidFetch("/item/remove", { access_token: accessToken });
    console.log(`removed from Plaid: ${item.institution_name} (${item.item_id})`);
  } catch (err) {
    console.error(`PLAID_REMOVE_FAILED ${item.institution_name}:`, err.message);
    continue; // don't mark DB status removed if the real removal failed
  }

  const { error: updErr } = await sb.from("plaid_items").update({ status: "removed" }).eq("id", id);
  if (updErr) console.error("DB_UPDATE_FAILED", id, updErr.message);
  else console.log(`marked removed in DB: ${item.institution_name}`);
}
