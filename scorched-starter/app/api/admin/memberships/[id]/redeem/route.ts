// app/api/admin/memberships/[id]/redeem/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireInStudio } from "@/lib/admin-session";
import { redeemEntitlement } from "@/lib/memberships";

const redeemSchema = z.object({
  type: z.enum(["entrance", "wood_credit"]),
  amount: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireInStudio(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const parsed = redeemSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const result = await redeemEntitlement(id, {
      type: parsed.data.type,
      amount: parsed.data.amount,
      notes: parsed.data.notes,
    });

    if (!result) {
      return Response.json(
        { error: "Redemption blocked: membership isn't active or the balance is too low." },
        { status: 409 }
      );
    }

    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error("ADMIN_MEMBERSHIP_REDEEM_ERROR", err);
    return Response.json({ error: "Failed to redeem." }, { status: 500 });
  }
}
