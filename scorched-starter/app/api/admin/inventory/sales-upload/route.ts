import { NextRequest } from "next/server";
import { processSalesUpload } from "@/lib/inventory";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { monthKey, csvText, replace } = await req.json();
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return Response.json({ error: "monthKey must be in YYYY-MM format" }, { status: 400 });
    }
    if (!csvText) return Response.json({ error: "csvText is required" }, { status: 400 });
    const result = await processSalesUpload(monthKey, csvText, !!replace);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
