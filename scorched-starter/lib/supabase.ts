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
  location: "orem" | "slc";
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
  location: "orem" | "slc";
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
  manually_archived: boolean | null;
  created_at: string;
  updated_at: string;
};

export type BusinessHoursRecord = {
  location: "orem" | "slc";
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

export type JobOpeningRecord = {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  pay: string | null;
  description: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type JobTemplateRecord = {
  id: string;
  name: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  pay: string | null;
  description: string;
  created_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  group_size: number | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type ResponsibilityRecord = {
  id: string;
  text: string;
  cadence: "daily" | "weekly" | "monthly";
  hours: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type PrintJobRecord = {
  id: string;
  product_id: string | null;
  image_base64: string;
  status: "pending" | "printed";
  created_at: string;
  printed_at: string | null;
  location: "orem" | "slc";
};

export type EquipmentReportRecord = {
  id: string;
  category: "Low Inventory" | "Broken" | "Other";
  priority: "High" | "Medium" | "Low" | null;
  notes: string;
  status: "Open" | "Resolved";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  location: "orem" | "slc";
};

export type StaffRecord = {
  id: string;
  square_team_member_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ScheduleShiftRecord = {
  id: string;
  square_shift_id: string;
  square_location_id: string;
  square_team_member_id: string;
  job_title: string | null;
  start_at: string;
  end_at: string | null;
  notes: string | null;
  status: "draft" | "published";
  is_deleted: boolean;
  raw_payload: unknown;
  synced_at: string;
  created_at: string;
};

export type ScheduleShiftWithStaff = ScheduleShiftRecord & {
  staff_name: string | null;
};

export type CommentRecord = {
  id: string;
  board: "operations" | "social";
  entity_id: string;
  author: string;
  body: string;
  created_at: string;
  reactions: CommentReactionRecord[];
};

export type CommentReactionRecord = {
  id: string;
  comment_id: string;
  author: string;
  emoji: string;
  created_at: string;
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

// --- Marketing (email + SMS) ---------------------------------------------
// Backed by supabase-marketing-setup.sql. Status and source columns are TEXT
// with CHECK constraints in the database, so these unions are the only thing
// keeping call sites honest; keep them in step with that file.

export type EmailStatus = "subscribed" | "unsubscribed" | "bounced" | "complained" | "none";
export type SmsStatus = "subscribed" | "unsubscribed" | "invalid" | "none";
export type MarketingChannel = "email" | "sms";

export type ConsentSource =
  | "waiver"
  | "booking"
  | "footer_form"
  | "popup"
  | "import_legacy_sms"
  | "import_legacy_newsletter"
  | "inbound_keyword"
  | "unsubscribe_link"
  | "admin";

export type SubscriberRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email_status: EmailStatus;
  sms_status: SmsStatus;
  unsubscribe_token: string;
  tags: string[];
  last_sms_contact_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentEventRecord = {
  id: string;
  subscriber_id: string;
  channel: MarketingChannel;
  action: "opt_in" | "opt_out";
  source: ConsentSource;
  consent_text: string;
  ip: string | null;
  user_agent: string | null;
  occurred_at: string;
  created_at: string;
};

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "sent"
  | "cancelled";

// Tag filter for a campaign. "any" matches a subscriber carrying at least one
// of the tags, "all" requires every one. An empty tags array means everyone
// subscribed on that channel.
export type CampaignSegment = {
  tags?: string[];
  match?: "any" | "all";
};

export type CampaignRecord = {
  id: string;
  channel: MarketingChannel;
  name: string;
  subject: string | null;
  body: string;
  media_url: string | null;
  segment: CampaignSegment;
  status: CampaignStatus;
  scheduled_for: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SmsQueueStatus = "pending" | "sending" | "sent" | "delivered" | "failed" | "skipped";

export type SmsQueueRecord = {
  id: string;
  campaign_id: string;
  subscriber_id: string;
  to_number: string;
  body: string;
  status: SmsQueueStatus;
  is_new_contact: boolean;
  provider_message_handle: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  send_after: string;
  created_at: string;
  updated_at: string;
};

export type SmsMessageRecord = {
  id: string;
  provider_message_handle: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  content: string | null;
  media_url: string | null;
  service: "iMessage" | "SMS" | "RCS" | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  raw_payload: unknown;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
};
