// app/api/careers/apply/route.ts
// Job applications from /careers. The resume is attached to the notification
// email and never written to storage: nothing else in the app needs it, and a
// bucket of strangers' resumes is a liability nobody asked for.
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

// Vercel caps a serverless request body at 4.5MB, so the ceiling is the
// transport, not Resend (which allows 40MB a message). 4MB leaves room for the
// rest of the multipart body.
const MAX_RESUME_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const schema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  phone: z.string().trim().optional(),
  message: z.string().trim().optional(),
  jobTitle: z.string().trim().min(1),
  jobId: z.string().trim().optional(),
  company: z.string().optional(), // honeypot
});

// A filename reaches an email header, where a newline is an injection vector.
function safeFilename(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_{2,}/g, "_");
  return (cleaned || "resume").slice(-80);
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const parsed = schema.safeParse({
      name: str(form.get("name")),
      email: str(form.get("email")),
      phone: str(form.get("phone")),
      message: str(form.get("message")),
      jobTitle: str(form.get("jobTitle")),
      jobId: str(form.get("jobId")),
      company: str(form.get("company")),
    });

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Filled honeypot: succeed silently rather than tell a bot it was caught.
    if (data.company) return Response.json({ ok: true });

    if (!process.env.CONTACT_FROM || !process.env.CONTACT_TO) {
      console.error("Missing CONTACT_FROM or CONTACT_TO env var");
      return Response.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const resume = form.get("resume");
    const file = resume instanceof File && resume.size > 0 ? resume : null;

    if (file) {
      // Checked here rather than trusting the client's accept attribute.
      if (file.size > MAX_RESUME_BYTES) {
        return Response.json(
          { error: "Resume must be under 4MB." },
          { status: 413 }
        );
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return Response.json(
          { error: "Resume must be a PDF or Word document." },
          { status: 415 }
        );
      }
    }

    const lines = [
      `Position: ${data.jobTitle}`,
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      data.phone ? `Phone: ${data.phone}` : "",
      file ? `Resume: ${file.name} (${(file.size / 1024).toFixed(0)} KB)` : "Resume: not attached",
      data.jobId ? `Opening ID: ${data.jobId}` : "",
      "",
      data.message ?? "",
    ].filter(Boolean);

    // The SDK reports failures in the response rather than throwing, so a bare
    // await would let a rejected send return ok to the applicant.
    const { error: sendError } = await resend.emails.send({
      from: process.env.CONTACT_FROM,
      to: process.env.CONTACT_TO,
      subject: `Application: ${data.jobTitle} - ${data.name}`,
      replyTo: data.email,
      text: lines.join("\n"),
      attachments: file
        ? [
            {
              filename: safeFilename(file.name),
              content: Buffer.from(await file.arrayBuffer()),
              contentType: file.type,
            },
          ]
        : undefined,
    });

    if (sendError) {
      console.error("CAREERS_APPLY_SEND_ERROR", sendError);
      return Response.json({ error: "Email failed" }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("CAREERS_APPLY_ERROR", err);
    return Response.json({ error: "Email failed" }, { status: 500 });
  }
}
