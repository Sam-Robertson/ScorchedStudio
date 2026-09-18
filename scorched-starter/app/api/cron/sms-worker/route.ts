// app/api/cron/sms-worker/route.ts
//
// Drains sms_queue at the configured throughput. Runs every 5 minutes.
//
// A campaign is never sent by looping over the list inline: a 10DLC campaign
// has a carrier-assigned send rate, and exceeding it gets messages filtered
// rather than queued, so the queue is paced and this is what paces it.
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

    return Response.json({ ok: true, scheduled, ...result });
  } catch (err) {
    console.error("SMS_WORKER_ERROR", err);
    return Response.json({ error: "Worker failed" }, { status: 500 });
  }
}
