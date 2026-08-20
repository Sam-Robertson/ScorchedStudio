import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { recordCount } from "@/lib/inventory";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { countedQty } = await req.json();
    if (typeof countedQty !== "number" || countedQty < 0) {
      return Response.json({ error: "countedQty must be a non-negative number" }, { status: 400 });
    }
    await recordCount(id, countedQty);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
