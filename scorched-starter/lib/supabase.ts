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

export type WaiverMinor = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
};

export type WaiverRecord = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  signature_data?: string | null;
  signed_at: string;
  ip_address: string | null;
  minors: WaiverMinor[] | null;
};

export type TaskRecord = {
  id: string;
  asana_id: string | null;
  name: string;
  notes: string | null;
  board_column: "To do" | "Doing" | "Done" | "Blocked";
  priority: "High" | "Medium" | "Low" | null;
  status: string | null;
  assignee: string | null;
  assignee_email: string | null;
  start_date: string | null;
  due_date: string | null;
  sprint_dates: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessHoursRecord = {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
  updated_at: string;
};

export type BlockedDateRecord = {
  date: string;
  reason: string | null;
  created_at: string;
};

export type ProductRecord = {
  id: string;
  name: string;
  width_in: number;
  height_in: number;
  notes: string | null;
  active: boolean;
};

export type PrintJobRecord = {
  id: string;
  product_id: string | null;
  image_base64: string;
  status: "pending" | "printed";
  created_at: string;
  printed_at: string | null;
};

export type SocialPostRecord = {
  id: string;
  title: string;
  caption: string | null;
  priority: "High" | "Medium" | "Low" | null;
  status: "Draft" | "In Review" | "Approved" | "Published";
  scheduled_date: string | null;
  media_url: string | null;
  media_path: string | null;
  media_type: "image" | "video" | null;
  media_deleted: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
