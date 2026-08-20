// lib/admin-session.ts — server-only
//
// Replaces the old scheme where /api/admin/verify handed back the plaintext
// ADMIN_PASSWORD as the "token" and every route re-compared it to the same
// env var. A signed session carries {role, location} so the same token can
// express "full admin" vs. "this one location's staff," and every route
// checks it through requireAdmin()/requireInStudio() instead of a
// copy-pasted string comparison.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export type Role = "admin" | "location";
export type LocationKey = "orem" | "slc";

export type Session = {
  role: Role;
  location: LocationKey | null; // null for admin (all locations); set for location-tier
};

type Payload = Session & { exp: number };

// No refresh flow exists, and the token this replaces never expired at all —
// long-lived matches existing behavior rather than introducing surprise logouts.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 180;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("Missing ADMIN_SESSION_SECRET");
  return s;
}

export function signSession(session: Session): string {
  const payload: Payload = { ...session, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): Session | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expectedSig = createHmac("sha256", secret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  if (payload.role !== "admin" && payload.role !== "location") return null;

  return { role: payload.role, location: payload.location ?? null };
}

function tokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function getSession(req: NextRequest): Session | null {
  const token = tokenFromRequest(req);
  if (!token) return null;
  return verifySessionToken(token);
}

// Most of the app: only the admin tier may call these routes.
export function requireAdmin(req: NextRequest): Session | null {
  const session = getSession(req);
  if (!session || session.role !== "admin") return null;
  return session;
}

// The 4 In Studio routes (bookings, waivers, print-jobs, equipment-reports):
// either tier may call, but callers must use session.location to scope reads
// and writes — null means admin (all locations), a location key means that
// location only. This function itself does no scoping; it just authenticates.
export function requireInStudio(req: NextRequest): Session | null {
  return getSession(req);
}

// True if this session may act on a row belonging to `recordLocation` — admin
// (location === null) always can; a location-tier session only for its own.
export function canAccessLocation(session: Session, recordLocation: string): boolean {
  return session.role === "admin" || session.location === recordLocation;
}

// scrypt password hashing for location passwords, which — unlike
// ADMIN_PASSWORD — are DB-resident and admin-editable via /admin/locations,
// so they get hashed rather than compared as plaintext.
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
