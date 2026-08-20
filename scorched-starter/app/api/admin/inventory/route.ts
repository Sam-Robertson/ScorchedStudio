import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { createItem, getItemsWithStats } from "@/lib/inventory";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const items = await getItemsWithStats();
    return Response.json({ items });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { name, sku, safety_buffer_units } = await req.json();
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    const item = await createItem({
      name,
      sku: sku ?? null,
      safety_buffer_units: safety_buffer_units ?? 7,
    });
    return Response.json({ item });
  } catch (e) {
    const message = e instanceof Error && e.message.includes("duplicate")
      ? "An item with this name already exists."
      : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
