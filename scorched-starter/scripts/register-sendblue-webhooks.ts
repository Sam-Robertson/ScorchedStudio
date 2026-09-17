// scripts/register-sendblue-webhooks.ts
//
// Registers the `receive` and `outbound` webhooks with Sendblue so inbound
// texts and delivery statuses reach /api/webhooks/sendblue.
//
// Idempotent: it reads the current configuration first and only writes if our
// URL is missing. Safe to re-run.
//
// Dry run by default. Pass --apply to actually write. Reading is harmless, so
// the default shows exactly what would change without touching the account.
//
//   pnpm tsx scripts/register-sendblue-webhooks.ts
//   pnpm tsx scripts/register-sendblue-webhooks.ts --apply

const WEBHOOK_TYPES = ["receive", "outbound"] as const;
type WebhookType = (typeof WEBHOOK_TYPES)[number];

type WebhookEntry = string | { url?: string; secret?: string };

function baseUrl(): string {
  return (process.env.SENDBLUE_BASE_URL || "https://api.sendblue.com").replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  const keyId = process.env.SENDBLUE_API_KEY_ID;
  const secret = process.env.SENDBLUE_API_SECRET_KEY;
  if (!keyId || !secret) {
    throw new Error("Set SENDBLUE_API_KEY_ID and SENDBLUE_API_SECRET_KEY first.");
  }
  return {
    "sb-api-key-id": keyId,
    "sb-api-secret-key": secret,
    "content-type": "application/json",
  };
}

function targetUrl(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (!site) throw new Error("Set NEXT_PUBLIC_SITE_URL to the deployed origin.");
  if (site.includes("localhost")) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL points at localhost. Sendblue cannot reach it; use the deployed URL or a tunnel."
    );
  }
  return `${site}/api/webhooks/sendblue`;
}

function urlOf(entry: WebhookEntry): string | null {
  if (typeof entry === "string") return entry;
  return entry?.url ?? null;
}

async function currentWebhooks(): Promise<Record<string, WebhookEntry[]>> {
  const res = await fetch(`${baseUrl()}/api/account/webhooks`, { headers: headers() });
  if (!res.ok) throw new Error(`Could not read webhooks: HTTP ${res.status}`);
  const json = (await res.json()) as { webhooks?: Record<string, WebhookEntry[]> };
  return json.webhooks ?? {};
}

async function registerType(type: WebhookType, url: string, secret: string, apply: boolean) {
  const existing = await currentWebhooks();
  const forType = existing[type] ?? [];

  if (forType.some((e) => urlOf(e) === url)) {
    console.log(`  ${type}: already registered, nothing to do`);
    return;
  }

  if (!apply) {
    console.log(`  ${type}: WOULD register ${url}`);
    return;
  }

  // POST appends to the existing configuration rather than replacing it, so a
  // webhook someone else added by hand survives.
  const res = await fetch(`${baseUrl()}/api/account/webhooks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ webhooks: [{ url, secret }], type }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to register ${type}: HTTP ${res.status} ${body}`);
  }
  console.log(`  ${type}: registered ${url}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = targetUrl();
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      "Set SENDBLUE_WEBHOOK_SECRET first. The route rejects every delivery without it, so registering now would mean dropping real webhooks."
    );
  }

  console.log(apply ? "Registering Sendblue webhooks" : "Dry run (pass --apply to write)");
  console.log(`  target: ${url}`);

  for (const type of WEBHOOK_TYPES) {
    await registerType(type, url, secret, apply);
  }

  if (!apply) console.log("\nNothing was changed. Re-run with --apply when the URL above is correct.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
