// app/api/admin/locations/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getLocations } from "@/lib/locations";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const locations = await getLocations();
    // Never send password_hash/password_salt to the client.
    const safe = locations.map(({ password_hash, password_salt, ...rest }) => {
      void password_hash;
      void password_salt;
      return { ...rest, has_password: !!password_hash };
    });
    return Response.json(safe);
  } catch (err) {
    console.error("ADMIN_LOCATIONS_GET_ERROR", err);
    return Response.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
