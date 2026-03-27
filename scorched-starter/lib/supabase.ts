// lib/supabase.ts — server-only, never import in client components
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export type BookingRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  date: string;
  time_slot: string;
  party_size: number;
  amount_paid: number;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  status: "confirmed" | "cancelled";
  payment_method: "stripe" | "gift_card" | "get_out_pass" | "complimentary" | null;
  referral_source: string | null;
  referral_other: string | null;
  created_at: string;
};

export type WaiverRecord = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  signature_data: string;
  signed_at: string;
  ip_address: string | null;
};
