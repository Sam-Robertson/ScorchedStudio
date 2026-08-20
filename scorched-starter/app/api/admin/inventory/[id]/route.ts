import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { updateItem } from "@/lib/inventory";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { name, sku, safety_buffer_units, active } = await req.json();
    const item = await updateItem(id, { name, sku, safety_buffer_units, active });
    return Response.json({ item });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
