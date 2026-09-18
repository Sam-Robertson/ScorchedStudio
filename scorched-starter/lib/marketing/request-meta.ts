// lib/marketing/request-meta.ts
//
// The IP and user agent recorded alongside a consent event. This is the
// evidence that answers "prove this person opted in" months later, so every
// capture point records it the same way.
//
// Mirrors how app/api/waiver/route.ts already derives the IP behind Vercel's
// proxy, where x-forwarded-for is a comma-separated chain and the client is
// the first entry.
export function consentMetaFrom(req: Request): { ip: string | null; userAgent: string | null } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  return { ip, userAgent: req.headers.get("user-agent") };
}
