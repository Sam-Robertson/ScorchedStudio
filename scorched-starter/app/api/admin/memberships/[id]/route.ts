// app/api/admin/memberships/[id]/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getMembershipById, getPlanByKey, getRedemptionsForMembership } from "@/lib/memberships";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const membership = await getMembershipById(id);
    if (!membership) {
      return Response.json({ error: "Membership not found" }, { status: 404 });
    }

    const [plan, redemptions] = await Promise.all([
      getPlanByKey(membership.plan_key),
      getRedemptionsForMembership(id),
    ]);

    return Response.json({ membership, plan, redemptions });
  } catch (err) {
    console.error("ADMIN_MEMBERSHIP_DETAIL_ERROR", err);
    return Response.json({ error: "Failed to load membership" }, { status: 500 });
  }
}
