// lib/supabase.ts — server-only, never import in client components
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
