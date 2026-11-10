// app/api/admin/search/route.ts
//
// Backs the admin search palette (components/admin/AdminSearch.tsx). One query
// fans out to the tables people actually go looking through: bookings,
// waivers, memberships and, for the admin tier, customer accounts. Each source
// returns a handful of hits that link to the matching page with its own search
// box pre-filled, so this route never has to render a record itself.
//
// Either tier may call it. A location account only sees bookings and waivers
// from its own location, and never sees customer accounts (that page is
// admin only).
import { NextRequest } from "next/server";
import { requireInStudio } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";
import { anyColumnLike, searchTokens } from "@/lib/postgrest-search";
import { formatDenverDate } from "@/lib/timezone";

const PER_SOURCE = 6;

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type SearchGroup = {
  key: "bookings" | "waivers" | "memberships" | "customers";
  label: string;
  hits: SearchHit[];
};

const LOCATION_LABEL: Record<string, string> = { orem: "Orem", slc: "SLC" };

function prettyDate(ymd: string): string {
  // Plain YYYY-MM-DD; anchored at midday so it never renders a day early.
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function withQuery(path: string, params: Record<string, string>): string {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function join(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

export async function GET(req: NextRequest) {
  const session = requireInStudio(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const tokens = searchTokens(raw);
  if (tokens.length === 0) return Response.json({ groups: [] });

  const sb = getSupabase();
  const location = session.role === "location" ? session.location : null;

  let bookings = sb
    .from("bookings")
    .select("id,name,email,date,time_slot,party_size,location")
    .neq("status", "cancelled");
  let waivers = sb.from("waivers").select("id,first_name,last_name,email,signed_at,location");
  let memberships = sb.from("memberships").select("id,name,email,plan_key,status");
  let customers = sb.from("customers").select("id,email,created_at");

  if (location) {
    bookings = bookings.eq("location", location);
    waivers = waivers.eq("location", location);
  }

  for (const t of tokens) {
    bookings = bookings.or(anyColumnLike(["name", "email", "phone"], t));
    waivers = waivers.or(anyColumnLike(["first_name", "last_name", "email", "phone"], t));
    memberships = memberships.or(anyColumnLike(["name", "email", "phone"], t));
    customers = customers.or(anyColumnLike(["email"], t));
  }

  const [bRes, wRes, mRes, cRes] = await Promise.all([
    bookings.order("date", { ascending: false }).limit(PER_SOURCE),
    waivers.order("signed_at", { ascending: false }).limit(PER_SOURCE),
    memberships.order("created_at", { ascending: false }).limit(PER_SOURCE),
    session.role === "admin"
      ? customers.order("created_at", { ascending: false }).limit(PER_SOURCE)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const failed = [bRes, wRes, mRes, cRes].find((r) => r.error);
  if (failed?.error) {
    console.error("ADMIN_SEARCH_ERROR", failed.error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }

  type B = { id: string; name: string; email: string; date: string; time_slot: string; party_size: number; location: string };
  type W = { id: string; first_name: string | null; last_name: string | null; email: string; signed_at: string; location: string | null };
  type M = { id: string; name: string | null; email: string; plan_key: string; status: string };
  type C = { id: string; email: string; created_at: string };

  const groups: SearchGroup[] = [
    {
      key: "bookings",
      label: "Bookings",
      hits: ((bRes.data ?? []) as B[]).map((b) => ({
        id: b.id,
        title: b.name || b.email,
        subtitle: join(
          `${prettyDate(b.date)} ${b.time_slot}`,
          `party of ${b.party_size}`,
          LOCATION_LABEL[b.location],
        ),
        href: withQuery("/admin/bookings", { q: b.email, booking: b.id }),
      })),
    },
    {
      key: "waivers",
      label: "Waivers",
      hits: ((wRes.data ?? []) as W[]).map((w) => {
        const name = [w.first_name, w.last_name].filter(Boolean).join(" ");
        return {
          id: w.id,
          title: name || w.email,
          subtitle: join(
            w.email,
            `signed ${formatDenverDate(w.signed_at)}`,
            w.location ? LOCATION_LABEL[w.location] : null,
          ),
          href: withQuery("/admin/waivers", { q: w.email || name }),
        };
      }),
    },
    {
      key: "memberships",
      label: "Memberships",
      hits: ((mRes.data ?? []) as M[]).map((m) => ({
        id: m.id,
        title: m.name || m.email,
        subtitle: join(m.email, capitalize(m.plan_key), m.status),
        href: withQuery("/admin/memberships", { q: m.email }),
      })),
    },
    {
      key: "customers",
      label: "Customer accounts",
      hits: ((cRes.data ?? []) as C[]).map((c) => ({
        id: c.id,
        title: c.email,
        subtitle: `account since ${formatDenverDate(c.created_at)}`,
        href: withQuery("/admin/customers", { q: c.email }),
      })),
    },
  ];

  return Response.json({ groups: groups.filter((g) => g.hits.length > 0) });
}
