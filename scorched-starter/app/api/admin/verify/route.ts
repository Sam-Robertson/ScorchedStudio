// app/api/admin/verify/route.ts
import { signSession } from "@/lib/admin-session";
import { matchLocationPassword } from "@/lib/locations";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password) {
      return Response.json({ error: "Invalid password" }, { status: 401 });
    }

    if (password === process.env.ADMIN_PASSWORD) {
      const token = signSession({ role: "admin", location: null });
      return Response.json({ token, role: "admin", location: null });
    }

    const location = await matchLocationPassword(password);
    if (location) {
      const token = signSession({ role: "location", location });
      return Response.json({ token, role: "location", location });
    }

    return Response.json({ error: "Invalid password" }, { status: 401 });
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
}
