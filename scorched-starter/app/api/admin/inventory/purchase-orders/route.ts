import { NextRequest } from "next/server";
import { createPurchaseOrder } from "@/lib/inventory";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { item_id, order_date, quantity_ordered, notes } = await req.json();
    if (!item_id || !order_date) {
      return Response.json({ error: "item_id and order_date are required" }, { status: 400 });
    }
    const po = await createPurchaseOrder({
      item_id,
      order_date,
      quantity_ordered: quantity_ordered ?? null,
      notes: notes ?? null,
    });
    return Response.json({ purchaseOrder: po });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
