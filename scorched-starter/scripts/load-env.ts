// scripts/load-env.ts
//
// tsx does not load .env the way Next does. Without this a script runs with no
// Supabase credentials and every row fails on "Missing SUPABASE_URL", which
// looks like a data problem rather than a configuration one. The first real
// import run hit exactly that and wrote nothing.
//
// Written here rather than solved with `set -a; . ./.env` because .env holds a
// quoted value containing angle brackets, which breaks shell sourcing.
import { existsSync, readFileSync } from "node:fs";

export function loadEnv(file = ".env"): void {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, raw] = match;
    // A variable already set in the real environment always wins, so a CI run
    // or an explicit override is never silently replaced by the file.
    if (process.env[key] !== undefined) continue;

    process.env[key] = raw.trim().replace(/^"([\s\S]*)"$/, "$1");
  }
}
