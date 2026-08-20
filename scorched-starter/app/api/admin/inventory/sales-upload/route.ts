import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { processSalesUpload } from "@/lib/inventory";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
