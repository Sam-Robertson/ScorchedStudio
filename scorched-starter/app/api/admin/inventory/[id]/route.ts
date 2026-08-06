import { NextRequest } from "next/server";
import { updateItem } from "@/lib/inventory";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { name, sku, safety_buffer_units, active } = await req.json();
    const item = await updateItem(id, { name, sku, safety_buffer_units, active });
    return Response.json({ item });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
