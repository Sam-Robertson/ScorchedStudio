import { NextRequest } from "next/server";
import { markPurchaseOrderReceived } from "@/lib/inventory";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
