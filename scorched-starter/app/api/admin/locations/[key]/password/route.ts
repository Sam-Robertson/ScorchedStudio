// app/api/admin/locations/[key]/password/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { setLocationPassword } from "@/lib/locations";

const schema = z.object({ password: z.string().min(6, "Password must be at least 6 characters") });

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await setLocationPassword(key, parsed.data.password);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("ADMIN_LOCATION_PASSWORD_ERROR", err);
    return Response.json({ error: "Failed to set password" }, { status: 500 });
  }
}
