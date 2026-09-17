// app/api/cron/sms-worker/route.ts
//
// Drains sms_queue against Sendblue's rate limits. Runs every 5 minutes.
//
// A campaign is never sent by looping over the list inline: the Blue Ocean
// plan caps how many new conversations may start per hour and per day, so a
// large campaign drips over hours or days and this is what does the dripping.
import { NextRequest } from "next/server";
import { runSmsWorker } from "@/lib/marketing/sms-worker";
import { startDueCampaigns } from "@/lib/marketing/scheduled-campaigns";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scheduled campaigns start here rather than on their own cron. An SMS
    // campaign becoming 'sending' is exactly what lets the worker below pick
    // it up in the same run.
    const scheduled = await startDueCampaigns();

    const result = await runSmsWorker();

    // The consecutive-no-reply ceiling is the one limit no config value can
    // raise, so it is logged at error level rather than buried in the result.
    if (result.blockedReason) {
      console.error("SMS_WORKER_BLOCKED", result.blockedReason);
    }

    return Response.json({ ok: true, scheduled, ...result });
  } catch (err) {
    console.error("SMS_WORKER_ERROR", err);
    return Response.json({ error: "Worker failed" }, { status: 500 });
  }
}
