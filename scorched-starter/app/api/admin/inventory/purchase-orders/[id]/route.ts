import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { markPurchaseOrderReceived } from "@/lib/inventory";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { arrival_date } = await req.json();
    if (!arrival_date) return Response.json({ error: "arrival_date is required" }, { status: 400 });
    const po = await markPurchaseOrderReceived(id, arrival_date);
    return Response.json({ purchaseOrder: po });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
