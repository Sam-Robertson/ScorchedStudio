// lib/courses.ts — server-only data layer for courses, cohorts, sessions,
// enrollments, and the waitlist. Keeps the checkout route and webhook thin,
// same split as lib/memberships.ts.
import { getSupabase } from "@/lib/supabase";

export type CourseStatus = "active" | "inactive";
export type CohortStatus = "open" | "full" | "completed" | "cancelled";
export type EnrollmentStatus = "confirmed" | "cancelled" | "refunded";
export type WaitlistStatus = "waiting" | "notified" | "enrolled" | "declined";

export type CurriculumWeek = {
  week: number;
  title: string;
  topics: string[];
};

export type CourseRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  curriculum: CurriculumWeek[];
  default_price_cents: number;
  default_capacity: number;
  session_count: number;
  session_duration_minutes: number;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
};

export type CohortRecord = {
  id: string;
  course_id: string;
  label: string;
  location: "orem" | "slc";
  price_cents: number;
  capacity: number;
  status: CohortStatus;
  created_at: string;
  updated_at: string;
};

export type CohortSessionRecord = {
  id: string;
  cohort_id: string;
  session_number: number;
  session_date: string; // "YYYY-MM-DD"
  start_time: string;   // "HH:MM:SS"
  end_time: string;
  created_at: string;
};

export type CohortAvailability = {
  cohort_id: string;
  capacity: number;
  confirmed_count: number;
  seats_remaining: number;
  is_full: boolean;
};

export type CourseEnrollmentRecord = {
  id: string;
  cohort_id: string;
  name: string;
  email: string;
  phone: string | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_paid_cents: number;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
};

export type CourseWaitlistRecord = {
  id: string;
  cohort_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: WaitlistStatus;
  notified_at: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Formatting                                                            */
/* ------------------------------------------------------------------ */

// "2026-09-29" -> "Tuesday, September 29, 2026"
export function formatSessionDate(sessionDate: string): string {
  return new Date(sessionDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// "18:00:00" -> "6:00 PM"
export function formatSessionTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ------------------------------------------------------------------ */
/* Public reads                                                         */
/* ------------------------------------------------------------------ */

export async function getActiveCourses(): Promise<CourseRecord[]> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CourseRecord[];
}

export async function getCourseBySlug(slug: string): Promise<CourseRecord | null> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as CourseRecord | null;
}

export async function getCohortsForCourse(courseId: string): Promise<CohortRecord[]> {
  const { data, error } = await getSupabase()
    .from("course_cohorts")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CohortRecord[];
}

export async function getCohortById(cohortId: string): Promise<CohortRecord | null> {
  const { data, error } = await getSupabase()
    .from("course_cohorts")
    .select("*")
    .eq("id", cohortId)
    .maybeSingle();
  if (error) throw error;
  return data as CohortRecord | null;
}

// Used by checkout to build the line item description and cancel_url, and by
// the webhook's confirmation/oversell emails.
export async function getCohortWithCourse(
  cohortId: string
): Promise<{ cohort: CohortRecord; course: CourseRecord } | null> {
  const { data: cohort, error } = await getSupabase()
    .from("course_cohorts")
    .select("*")
    .eq("id", cohortId)
    .maybeSingle();
  if (error) throw error;
  if (!cohort) return null;

  const { data: course, error: courseError } = await getSupabase()
    .from("courses")
    .select("*")
    .eq("id", (cohort as CohortRecord).course_id)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) return null;

  return { cohort: cohort as CohortRecord, course: course as CourseRecord };
}

export async function getSessionsForCohort(cohortId: string): Promise<CohortSessionRecord[]> {
  const { data, error } = await getSupabase()
    .from("course_sessions")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("session_number", { ascending: true });
  if (error) throw error;
  return data as CohortSessionRecord[];
}

// Seats remaining, from the course_cohort_availability view — never counts
// raw enrollment rows in application code, so a caller can't accidentally
// leak enrollee names/emails by fetching more than this aggregate.
export async function getCohortAvailability(cohortId: string): Promise<CohortAvailability | null> {
  const { data, error } = await getSupabase()
    .from("course_cohort_availability")
    .select("*")
    .eq("cohort_id", cohortId)
    .maybeSingle();
  if (error) throw error;
  return data as CohortAvailability | null;
}

export async function getAvailabilityForCohorts(cohortIds: string[]): Promise<CohortAvailability[]> {
  if (cohortIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("course_cohort_availability")
    .select("*")
    .in("cohort_id", cohortIds);
  if (error) throw error;
  return data as CohortAvailability[];
}

/* ------------------------------------------------------------------ */
/* Enrollment + waitlist                                                */
/* ------------------------------------------------------------------ */

// Atomically enrolls via the enroll_in_cohort SQL function (see
// supabase-courses-setup.sql) — returns null if the cohort is full (or
// already handled retried delivery, in which case it returns the existing
// row instead of a duplicate). Called only from the webhook, after payment
// has succeeded.
export async function enrollInCohort(input: {
  cohort_id: string;
  name: string;
  email: string;
  phone: string | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_paid_cents: number;
}): Promise<CourseEnrollmentRecord | null> {
  const { data: enrollment, error } = await getSupabase()
    .rpc("enroll_in_cohort", {
      p_cohort_id: input.cohort_id,
      p_name: input.name,
      p_email: input.email,
      p_phone: input.phone,
      p_stripe_checkout_session_id: input.stripe_checkout_session_id,
      p_stripe_payment_intent_id: input.stripe_payment_intent_id,
      p_amount_paid_cents: input.amount_paid_cents,
    })
    .single();
  if (error) throw error;
  // Belt-and-suspenders, same as redeemEntitlement in lib/memberships.ts: the
  // SQL function returns SQL NULL when the cohort is full, which PostgREST
  // sends as JSON null — but check a required field too, in case a future
  // edit to the function reintroduces a "row of all-null fields" (truthy
  // object) instead.
  if (!enrollment || (enrollment as CourseEnrollmentRecord).id == null) return null;
  return enrollment as CourseEnrollmentRecord;
}

export async function addToWaitlist(input: {
  cohort_id: string;
  name: string;
  email: string;
  phone: string | null;
}): Promise<CourseWaitlistRecord> {
  const { data, error } = await getSupabase()
    .from("course_waitlist")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as CourseWaitlistRecord;
}

/* ------------------------------------------------------------------ */
/* Admin reads                                                          */
/* ------------------------------------------------------------------ */

export async function listCourses(): Promise<CourseRecord[]> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CourseRecord[];
}

export async function listEnrollmentsForCohort(cohortId: string): Promise<CourseEnrollmentRecord[]> {
  const { data, error } = await getSupabase()
    .from("course_enrollments")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CourseEnrollmentRecord[];
}

// Customer-facing /account dashboard — all enrollments tied to a verified email.
export async function getEnrollmentsByEmail(email: string): Promise<CourseEnrollmentRecord[]> {
  const { data, error } = await getSupabase()
    .from("course_enrollments")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CourseEnrollmentRecord[];
}

export async function listWaitlistForCohort(cohortId: string): Promise<CourseWaitlistRecord[]> {
  const { data, error } = await getSupabase()
    .from("course_waitlist")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CourseWaitlistRecord[];
}

/* ------------------------------------------------------------------ */
/* Admin writes                                                         */
/* ------------------------------------------------------------------ */

export async function createCourse(input: {
  name: string;
  slug: string;
  description: string;
  curriculum: CurriculumWeek[];
  default_price_cents: number;
  default_capacity: number;
  session_count: number;
  session_duration_minutes: number;
  status?: CourseStatus;
}): Promise<CourseRecord> {
  const { data, error } = await getSupabase().from("courses").insert(input).select().single();
  if (error) throw error;
  return data as CourseRecord;
}

export async function updateCourse(
  id: string,
  patch: Partial<{
    name: string;
    slug: string;
    description: string;
    curriculum: CurriculumWeek[];
    default_price_cents: number;
    default_capacity: number;
    session_count: number;
    session_duration_minutes: number;
    status: CourseStatus;
  }>
): Promise<CourseRecord> {
  const { data, error } = await getSupabase()
    .from("courses")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CourseRecord;
}

export async function createCohort(input: {
  course_id: string;
  label: string;
  location: "orem" | "slc";
  price_cents: number;
  capacity: number;
  status?: CohortStatus;
}): Promise<CohortRecord> {
  const { data, error } = await getSupabase().from("course_cohorts").insert(input).select().single();
  if (error) throw error;
  return data as CohortRecord;
}

export async function updateCohort(
  id: string,
  patch: Partial<{
    label: string;
    location: "orem" | "slc";
    price_cents: number;
    capacity: number;
    status: CohortStatus;
  }>
): Promise<CohortRecord> {
  const { data, error } = await getSupabase()
    .from("course_cohorts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CohortRecord;
}

export async function createSession(input: {
  cohort_id: string;
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
}): Promise<CohortSessionRecord> {
  const { data, error } = await getSupabase().from("course_sessions").insert(input).select().single();
  if (error) throw error;
  return data as CohortSessionRecord;
}

export async function updateSession(
  id: string,
  patch: Partial<{ session_number: number; session_date: string; start_time: string; end_time: string }>
): Promise<CohortSessionRecord> {
  const { data, error } = await getSupabase()
    .from("course_sessions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CohortSessionRecord;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await getSupabase().from("course_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Full detail payload for the admin cohort management view — cohort fields,
// its sessions, confirmed enrollments, waitlist, and derived availability,
// fetched in parallel, same shape as membership's [id] detail route.
export async function getCohortDetail(cohortId: string): Promise<{
  cohort: CohortRecord;
  sessions: CohortSessionRecord[];
  enrollments: CourseEnrollmentRecord[];
  waitlist: CourseWaitlistRecord[];
  availability: CohortAvailability | null;
} | null> {
  const cohort = await getCohortById(cohortId);
  if (!cohort) return null;

  const [sessions, enrollments, waitlist, availability] = await Promise.all([
    getSessionsForCohort(cohortId),
    listEnrollmentsForCohort(cohortId),
    listWaitlistForCohort(cohortId),
    getCohortAvailability(cohortId),
  ]);

  return { cohort, sessions, enrollments, waitlist, availability };
}

// Marks a waitlist entry as notified — does not reserve a seat. Whoever
// completes checkout first for the cohort wins via enroll_in_cohort.
export async function markWaitlistNotified(id: string): Promise<CourseWaitlistRecord> {
  const { data, error } = await getSupabase()
    .from("course_waitlist")
    .update({ status: "notified", notified_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CourseWaitlistRecord;
}
