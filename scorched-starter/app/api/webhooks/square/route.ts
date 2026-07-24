// app/api/webhooks/square/route.ts
//
// Receives Square Labor API webhook events for ScheduledShift changes and
// keeps schedule_shifts in sync. Event type strings and the signature
// scheme (HMAC-SHA256 over notificationUrl + body, base64, compared
// against x-square-hmacsha256-signature) are confirmed against Square's
// own SDK source, not assumed.
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import {
  markScheduledShiftDeleted,
  upsertScheduledShift,
  upsertScheduledShiftById,
} from "@/lib/square-shifts-sync";
import type { SquareScheduledShift } from "@/lib/square";

type SquareWebhookEvent = {
  type?: string;
  event_id?: string;
  data?: {
    id?: string;
    object?: { scheduled_shift?: SquareScheduledShift };
    deleted?: boolean;
  };
};

function verifySignature(body: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  if (!signatureKey || !notificationUrl) return false;

  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + body, "utf8")
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature");

  if (!verifySignature(body, signature)) {
    console.error("SQUARE_WEBHOOK_SIG_ERROR");
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as SquareWebhookEvent;

  try {
    switch (event.type) {
      case "labor.scheduled_shift.created":
      case "labor.scheduled_shift.updated":
      case "labor.scheduled_shift.published": {
        const shift = event.data?.object?.scheduled_shift;
        if (shift) {
          await upsertScheduledShift(shift);
        } else if (event.data?.id) {
          await upsertScheduledShiftById(event.data.id);
        }
        break;
      }
      case "labor.scheduled_shift.deleted": {
        if (event.data?.id) {
          await markScheduledShiftDeleted(event.data.id);
        }
        break;
      }
      default:
        console.log("SQUARE_WEBHOOK_UNHANDLED_EVENT", event.type);
    }
  } catch (err) {
    console.error("SQUARE_WEBHOOK_PROCESSING_ERROR", err);
    return Response.json({ error: "Failed to process event" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
