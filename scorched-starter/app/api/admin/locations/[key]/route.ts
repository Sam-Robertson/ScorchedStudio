// app/api/admin/locations/[key]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import { updateLocation } from "@/lib/locations";

const patchSchema = z.object({
  is_bookable: z.boolean().optional(),
  capacity: z.number().int().positive().optional(),
  max_party_size: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  opening_estimate: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const location = await updateLocation(key, parsed.data);
    const { password_hash, password_salt, ...rest } = location;
    void password_hash;
    void password_salt;
    return Response.json({ ...rest, has_password: !!password_hash });
  } catch (err) {
    console.error("ADMIN_LOCATION_PATCH_ERROR", err);
    return Response.json({ error: "Failed to update location" }, { status: 500 });
  }
}
