import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function plaidBaseUrl() {
  return process.env.PLAID_ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
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

// Same AES-256-GCM layout as lib/accounting/encryption.ts (iv[12] || tag[16]
// || ciphertext), inlined since @/ path aliases don't resolve under
// node --experimental-strip-types.
import crypto from "crypto";
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

const oldItemIds = [
  "674916ae-74a6-4fd3-bad2-177207c078b1", // Chase (old)
  "4cf451e7-533d-4d0e-91cb-0384d57c3063", // American Express (old)
  "00c9a33c-c0ee-4409-ac1e-820650d8febe", // U.S. Bank (old)
];

for (const id of oldItemIds) {
  const { data: item, error } = await sb.from("plaid_items").select("id, item_id, institution_name, access_token_enc").eq("id", id).single();
  if (error || !item) { console.error("not found", id, error?.message); continue; }

  try {
    const accessToken = decryptToken(fromPgBytea(item.access_token_enc));
    await plaidFetch("/item/remove", { access_token: accessToken });
    console.log(`removed from Plaid: ${item.institution_name} (${item.item_id})`);
  } catch (err) {
    console.error(`PLAID_REMOVE_FAILED ${item.institution_name}:`, err.message);
  }

  const { error: updErr } = await sb.from("plaid_items").update({ status: "removed" }).eq("id", id);
  if (updErr) console.error("DB_UPDATE_FAILED", id, updErr.message);
  else console.log(`marked removed in DB: ${item.institution_name}`);
}
