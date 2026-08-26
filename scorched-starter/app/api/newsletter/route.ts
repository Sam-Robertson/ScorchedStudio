import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

const schema = z
  .object({
    email: z.string().email("Valid email required"),
    // Honeypot — bots will often fill this. Should stay empty.
    company: z.string().optional(),
  })
  .strip();

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }

    // Honeypot filled — silently succeed so bots aren't tipped off.
    if (parsed.data.company) {
      return Response.json({ ok: true });
    }

    const sb = getSupabase();
    const { error } = await sb
      .from("newsletter_subscribers")
      .insert({ email: parsed.data.email.trim().toLowerCase() });
    // Duplicate email is not an error from the caller's perspective — they're
    // already subscribed, which is the desired end state.
    if (error && error.code !== "23505") {
      return Response.json({ error: "Failed to subscribe" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("NEWSLETTER_API_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
