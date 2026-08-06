import { NextRequest } from "next/server";
import { recordCount } from "@/lib/inventory";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
