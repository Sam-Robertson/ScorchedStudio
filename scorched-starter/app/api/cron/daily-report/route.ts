// app/api/cron/daily-report/route.ts
// Called by Vercel Cron at 3:00 AM UTC (≈ 9 PM MDT / 8 PM MST).
// Sends a summary of bookings created today to contact@scorchedstudio.com.

import { NextRequest } from "next/server";
import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPayment(method: string | null): string {
  switch (method) {
    case "gift_card": return "Gift Card";
    case "get_out_pass": return "Get Out Pass";
    case "complimentary": return "Complimentary";
    case "stripe": return "Card";
    default: return "—";
  }
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Today's date in UTC (Vercel runs in UTC)
  const todayUTC = new Date().toISOString().split("T")[0];

  // Fetch bookings created today
  const { data: bookings, error } = await getSupabase()
    .from("bookings")
    .select("*")
    .gte("created_at", `${todayUTC}T00:00:00.000Z`)
    .lt("created_at", `${todayUTC}T23:59:59.999Z`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("DAILY_REPORT_DB_ERROR", error);
    return Response.json({ error: "DB error" }, { status: 500 });
  }

  const confirmed = (bookings ?? []).filter((b) => b.status === "confirmed");
  const cancelled = (bookings ?? []).filter((b) => b.status === "cancelled");
  const totalPeople = confirmed.reduce((s: number, b: { party_size: number }) => s + b.party_size, 0);
  const totalRevenue = confirmed.reduce((s: number, b: { amount_paid: number }) => s + b.amount_paid, 0);

  const reportDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Denver",
  });

  // Skip sending if nothing happened today
  if (confirmed.length === 0 && cancelled.length === 0) {
    console.log("DAILY_REPORT: No activity today, skipping email.");
    return Response.json({ sent: false, reason: "No activity" });
  }

  // Build booking rows HTML
  const bookingRows = confirmed.map((b: {
    name: string; date: string; time_slot: string;
    party_size: number; payment_method: string | null; amount_paid: number;
  }) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${b.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${fmtDate(b.date)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${b.time_slot}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: center;">${b.party_size}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${fmtPayment(b.payment_method)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: right;">$${(b.amount_paid / 100).toFixed(2)}</td>
    </tr>
  `).join("");

  const cancelledSection = cancelled.length > 0 ? `
    <h3 style="font-size: 14px; color: #888; margin: 24px 0 8px;">Cancellations (${cancelled.length})</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
      <thead>
        <tr style="background: #fafafa; text-align: left;">
          <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Name</th>
          <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Session Date</th>
          <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Time</th>
          <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;">Party</th>
        </tr>
      </thead>
      <tbody>
        ${cancelled.map((b: { name: string; date: string; time_slot: string; party_size: number }) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${b.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${fmtDate(b.date)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${b.time_slot}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: center;">${b.party_size}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "";

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 680px; margin: 0 auto; color: #3A3A3A;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">Daily Booking Report</h1>
      <p style="color: #888; font-size: 14px; margin-bottom: 24px;">${reportDate}</p>

      <!-- Summary cards -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
        <tr>
          <td style="width: 33%; padding: 16px; background: #f7f6f3; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #884A20;">${confirmed.length}</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">New Booking${confirmed.length !== 1 ? "s" : ""}</div>
          </td>
          <td style="width: 4px;"></td>
          <td style="width: 33%; padding: 16px; background: #f7f6f3; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #884A20;">${totalPeople}</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">People Booked</div>
          </td>
          <td style="width: 4px;"></td>
          <td style="width: 33%; padding: 16px; background: #f7f6f3; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #519A70;">$${(totalRevenue / 100).toFixed(2)}</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">Revenue Collected</div>
          </td>
        </tr>
      </table>

      ${confirmed.length > 0 ? `
        <h3 style="font-size: 14px; color: #888; margin: 0 0 8px;">New Bookings (${confirmed.length})</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <thead>
            <tr style="background: #fafafa; text-align: left;">
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Name</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Session Date</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Time</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;">Party</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;">Payment</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">Paid</th>
            </tr>
          </thead>
          <tbody>
            ${bookingRows}
          </tbody>
        </table>
      ` : ""}

      ${cancelledSection}

      <p style="margin-top: 28px; font-size: 12px; color: #bbb;">
        View all bookings at <a href="https://scorchedstudio.com/admin/bookings" style="color: #884A20;">scorchedstudio.com/admin/bookings</a>
      </p>
    </div>
  `;

  await resend.emails.send({
    from: "Scorched Studio <bookings@scorchedstudio.com>",
    to: "contact@scorchedstudio.com",
    subject: `Daily Report — ${confirmed.length} booking${confirmed.length !== 1 ? "s" : ""} · ${reportDate}`,
    html,
  });

  console.log(`DAILY_REPORT: Sent — ${confirmed.length} confirmed, ${cancelled.length} cancelled`);
  return Response.json({ sent: true, confirmed: confirmed.length, cancelled: cancelled.length });
}
