// app/api/contact/route.ts
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper: convert "" -> undefined
const emptyToUndef = (v?: string) =>
  typeof v === "string" && v.trim() === "" ? undefined : v?.trim();

const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email required"),

    // Optional fields (allow empty in the payload)
    phone: z.string().optional().transform(emptyToUndef),
    groupSize: z.string().optional().transform(emptyToUndef),
    date: z.string().optional().transform(emptyToUndef),
    message: z.string().optional().transform(emptyToUndef),

    source: z.string().optional().default("web"),

    // Honeypot (bots will often fill this)
    company: z.string().optional(), // should be empty
  })
  .strip(); // ignore unknown keys instead of failing

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", issues: parsed.error.flatten() }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const data = parsed.data;

    // If honeypot is filled, silently succeed to avoid tipping off bots
    if (data.company) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (!process.env.CONTACT_FROM || !process.env.CONTACT_TO) {
      console.error("Missing CONTACT_FROM or CONTACT_TO env var");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const lines: string[] = [
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      data.phone ? `Phone: ${data.phone}` : "",
      data.groupSize ? `Group Size: ${data.groupSize}` : "",
      data.date ? `Preferred Date: ${data.date}` : "",
      data.source ? `Source: ${data.source}` : "",
      "",
      data.message ?? "",
    ].filter(Boolean);

    await resend.emails.send({
      from: process.env.CONTACT_FROM,
      to: process.env.CONTACT_TO,
      subject: `New contact: ${data.name}`,
      replyTo: data.email,
      text: lines.join("\n"),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("CONTACT_API_ERROR", err);
    return new Response(JSON.stringify({ error: "Email failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
