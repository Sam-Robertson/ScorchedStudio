// app/api/admin/memberships/[id]/redeem/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { redeemEntitlement } from "@/lib/memberships";

function isAuthed(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === process.env.ADMIN_PASSWORD;
}

const redeemSchema = z.object({
  type: z.enum(["entrance", "wood_credit"]),
  amount: z.number().int().positive(),
  redeemed_by: z.string().min(1),
  square_order_id: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) {
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
      redeemedBy: parsed.data.redeemed_by,
      squareOrderId: parsed.data.square_order_id,
      notes: parsed.data.notes,
    });

    if (!result) {
      return Response.json(
        { error: "Redemption blocked — membership isn't active or the balance is too low." },
        { status: 409 }
      );
    }

    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error("ADMIN_MEMBERSHIP_REDEEM_ERROR", err);
    return Response.json({ error: "Failed to redeem." }, { status: 500 });
  }
}
