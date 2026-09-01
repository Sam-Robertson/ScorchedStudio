// app/api/admin/accounting/rules/route.ts — categorization rules CRUD
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("categorization_rules")
      .select("*, accounts(code,name), bank_accounts(name,mask), locations(key,name)")
      .order("priority");
    if (error) {
      console.error("ACCOUNTING_RULES_GET_ERROR", error);
      return Response.json({ error: "Failed to fetch rules" }, { status: 500 });
    }
    return Response.json({ rules: data });
  } catch (err) {
    console.error("ACCOUNTING_RULES_GET_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const {
      priority = 100,
      matchField = "name",
      matchRegex,
      bankAccountId = null,
      amountMin = null,
      amountMax = null,
      direction = null,
      template,
      targetAccountCode = null,
      locationKey = null,
      createdFromOverride = false,
    } = body;

    if (typeof matchRegex !== "string" || !matchRegex) {
      return Response.json({ error: "matchRegex is required" }, { status: 400 });
    }
    if (typeof template !== "string" || !template) {
      return Response.json({ error: "template is required" }, { status: 400 });
    }
    try {
      new RegExp(matchRegex);
    } catch {
      return Response.json({ error: "matchRegex is not a valid regular expression" }, { status: 400 });
    }

    const sb = getSupabase();

    let targetAccountId: string | null = null;
    if (targetAccountCode) {
      const { data: acc, error: accErr } = await sb.from("accounts").select("id").eq("code", targetAccountCode).single();
      if (accErr || !acc) return Response.json({ error: `Unknown target account code ${targetAccountCode}` }, { status: 400 });
      targetAccountId = acc.id;
    }

    let locationId: string | null = null;
    if (locationKey === "orem" || locationKey === "slc") {
      const { data: loc } = await sb.from("locations").select("id").eq("key", locationKey).single();
      locationId = loc?.id ?? null;
    }

    const { data, error } = await sb
      .from("categorization_rules")
      .insert({
        priority,
        match_field: matchField,
        match_regex: matchRegex,
        bank_account_id: bankAccountId,
        amount_min: amountMin,
        amount_max: amountMax,
        direction,
        template,
        target_account_id: targetAccountId,
        location_id: locationId,
        created_from_override: !!createdFromOverride,
      })
      .select()
      .single();

    if (error) {
      console.error("ACCOUNTING_RULES_POST_ERROR", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ rule: data });
  } catch (err) {
    console.error("ACCOUNTING_RULES_POST_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id: unknown = body.id;
    if (typeof id !== "string") return Response.json({ error: "id is required" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.priority === "number") patch.priority = body.priority;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const sb = getSupabase();
    const { data, error } = await sb.from("categorization_rules").update(patch).eq("id", id).select().single();
    if (error) {
      console.error("ACCOUNTING_RULES_PATCH_ERROR", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ rule: data });
  } catch (err) {
    console.error("ACCOUNTING_RULES_PATCH_ERROR", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
