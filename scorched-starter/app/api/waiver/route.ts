// app/api/waiver/route.ts
import { Resend } from "resend";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Required"),
  signatureData: z.string().min(1, "Signature required"),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const { error: dbError } = await getSupabase().from("waivers").insert({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone || null,
      date_of_birth: data.dateOfBirth,
      signature_data: data.signatureData,
      ip_address: ip,
    });

    if (dbError) {
      console.error("WAIVER_DB_ERROR", dbError);
      return Response.json({ error: "Failed to save waiver" }, { status: 500 });
    }

    const signedDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await resend.emails.send({
      from: "Scorched Studio <bookings@scorchedstudio.com>",
      to: data.email,
      subject: "Your Scorched Studio Waiver — You're all set!",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #3A3A3A;">
          <h1 style="font-size: 22px; margin-bottom: 8px;">You're all set, ${data.firstName}!</h1>
          <p style="color: #555; margin-bottom: 24px;">
            Thanks for signing the Scorched Studio waiver. We have your signature on file,
            so you're ready to burn on your next visit.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px; width: 40%;">Name</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${data.firstName} ${data.lastName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #888; font-size: 13px;">Signed on</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${signedDate}</td>
            </tr>
          </table>
          <p style="color: #555; font-size: 14px;">
            Have questions? Email us at
            <a href="mailto:contact@scorchedstudio.com" style="color: #884A20;">contact@scorchedstudio.com</a>
            or give us a call at
            <a href="tel:+18013619066" style="color: #884A20;">(801) 361-9066</a>.
          </p>
          <p style="color: #aaa; font-size: 12px; margin-top: 12px;">
            Please do not reply directly to this email — it is not monitored.
          </p>
          <p style="color: #555; font-size: 14px; margin-top: 24px;">
            See you soon!<br/>
            <strong>— The Scorched Studio Team</strong>
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />

          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #aaa; margin-bottom: 8px;">While you&apos;re here</p>
          <h2 style="font-size: 18px; margin: 0 0 8px;">Join Scorched VIP — It&apos;s Free</h2>
          <p style="color: #555; font-size: 14px; margin-bottom: 20px;">
            Sign up for our loyalty program and get exclusive deals, hear about new products first,
            and pick up a <strong>free wooden ring</strong> on your next visit.
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 46%; vertical-align: top;">
                <table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-radius: 12px;">
                  <tr><td style="padding: 16px 16px 4px; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #884A20;">Scan In Studio</td></tr>
                  <tr><td style="padding: 8px 16px; text-align: center;">
                    <img src="https://scorchedstudio.com/squareQR.png" alt="Scorched VIP QR code" width="100" height="100" style="border-radius: 8px; display: block; margin: 0 auto;" />
                  </td></tr>
                  <tr><td style="padding: 4px 16px 16px; text-align: center; font-size: 12px; color: #666;">Scan at the front desk</td></tr>
                </table>
              </td>
              <td style="width: 8%; text-align: center; vertical-align: middle; color: #aaa; font-size: 13px; font-style: italic; padding: 0 4px;">or</td>
              <td style="width: 46%; vertical-align: top;">
                <table style="width: 100%; border-collapse: collapse; background: #F6E4E1; border-radius: 12px;">
                  <tr><td style="padding: 16px 16px 4px; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #884A20;">Text to Join</td></tr>
                  <tr><td style="padding: 8px 16px; text-align: center; font-size: 28px; font-weight: bold; color: #884A20;">JOIN</td></tr>
                  <tr><td style="padding: 0 16px; text-align: center; font-size: 13px; color: #555;">to <strong>833-388-5416</strong></td></tr>
                  <tr><td style="padding: 4px 16px 16px; text-align: center; font-size: 12px; color: #666;">From anywhere, anytime</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("WAIVER_API_ERROR", err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
