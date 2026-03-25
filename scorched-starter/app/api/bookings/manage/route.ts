// app/api/bookings/manage/route.ts
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase().trim();

  if (!email) {
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await getSupabase()
    .from("bookings")
    .select("id, name, date, time_slot, party_size, payment_method, status, amount_paid")
    .eq("email", email)
    .eq("status", "confirmed")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("time_slot", { ascending: true });

  if (error) {
    console.error("MANAGE_LOOKUP_ERROR", error);
    return Response.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }

  return Response.json({ bookings: data ?? [] });
}
