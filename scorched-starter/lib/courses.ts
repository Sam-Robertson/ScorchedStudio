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

// "2026-09-29" -> "Sep 29". For cohort cards, where the weekday is already the
// cohort label and the year is carried by the confirmation email.
export function formatSessionDateShort(sessionDate: string): string {
  return new Date(sessionDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

// The webhook checks this before calling enroll_in_cohort, which hands back
// the existing row on a retried delivery, to tell a new enrollment from a retry.
export async function getEnrollmentByCheckoutSession(
  checkoutSessionId: string
): Promise<CourseEnrollmentRecord | null> {
  const { data, error } = await getSupabase()
    .from("course_enrollments")
    .select("*")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();
  if (error) throw error;
  return data as CourseEnrollmentRecord | null;
}

export type RecentEnrollment = CourseEnrollmentRecord & {
  course_id: string;
  course_name: string;
  cohort_label: string;
};

// Newest enrollments across every course, for the admin Courses page.
export async function listRecentEnrollments(limit: number): Promise<RecentEnrollment[]> {
  const { data, error } = await getSupabase()
    .from("course_enrollments")
    .select("*, course_cohorts(label, course_id, courses(name))")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = CourseEnrollmentRecord & {
    course_cohorts: { label: string; course_id: string; courses: { name: string } | null } | null;
  };
  return (data as Row[]).map(({ course_cohorts, ...enrollment }) => ({
    ...enrollment,
    course_id: course_cohorts?.course_id ?? "",
    course_name: course_cohorts?.courses?.name ?? "",
    cohort_label: course_cohorts?.label ?? "",
  }));
}

export type CohortSummary = Pick<CohortRecord, "id" | "course_id" | "label" | "status" | "capacity"> & {
  confirmed_count: number;
};

// Every cohort with its confirmed seat count, so the admin course list can
// show fill levels without opening each course.
export async function listCohortSummaries(): Promise<CohortSummary[]> {
  const supabase = getSupabase();
  const [cohortsRes, availabilityRes] = await Promise.all([
    supabase
      .from("course_cohorts")
      .select("id, course_id, label, status, capacity")
      .order("created_at", { ascending: true }),
    supabase.from("course_cohort_availability").select("cohort_id, confirmed_count"),
  ]);
  if (cohortsRes.error) throw cohortsRes.error;
  if (availabilityRes.error) throw availabilityRes.error;

  const counts = new Map(
    (availabilityRes.data as Pick<CohortAvailability, "cohort_id" | "confirmed_count">[]).map((a) => [
      a.cohort_id,
      Number(a.confirmed_count),
    ])
  );
  return (cohortsRes.data as Omit<CohortSummary, "confirmed_count">[]).map((c) => ({
    ...c,
    confirmed_count: counts.get(c.id) ?? 0,
  }));
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

// Whole days between two "YYYY-MM-DD" dates, computed in UTC so a DST change
// between the two cohorts can't shave the shift to 23 hours and round down.
function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.UTC(Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)) - 1, Number(fromDate.slice(8, 10)));
  const to = Date.UTC(Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7)) - 1, Number(toDate.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Copies a cohort (location, price, capacity) and its whole session schedule
// under a new label, shifting every session by the same number of days so the
// first session lands on `first_session_date`. Week-to-week spacing and the
// session times carry over unchanged. Enrollments and the waitlist stay with
// the original; the copy always starts out open with empty seats.
export async function duplicateCohort(
  cohortId: string,
  input: { label: string; first_session_date: string }
): Promise<{ cohort: CohortRecord; sessions: CohortSessionRecord[] }> {
  const [source, sessions] = await Promise.all([getCohortById(cohortId), getSessionsForCohort(cohortId)]);
  if (!source) throw new Error("Cohort not found.");

  const cohort = await createCohort({
    course_id: source.course_id,
    label: input.label,
    location: source.location,
    price_cents: source.price_cents,
    capacity: source.capacity,
    status: "open",
  });

  if (sessions.length === 0) return { cohort, sessions: [] };

  // Sessions come back ordered by session_number, which is the schedule order;
  // the earliest date is what anchors the shift in case numbering and dates
  // ever disagree.
  const earliest = sessions.reduce((min, s) => (s.session_date < min ? s.session_date : min), sessions[0].session_date);
  const shift = daysBetween(earliest, input.first_session_date);

  const { data, error } = await getSupabase()
    .from("course_sessions")
    .insert(
      sessions.map((s) => ({
        cohort_id: cohort.id,
        session_number: s.session_number,
        session_date: addDays(s.session_date, shift),
        start_time: s.start_time,
        end_time: s.end_time,
      }))
    )
    .select()
    .order("session_number", { ascending: true });

  if (error) {
    // Don't leave a cohort behind with no schedule; the cascade drops any
    // partial session rows too.
    await getSupabase().from("course_cohorts").delete().eq("id", cohort.id);
    throw error;
  }
  return { cohort, sessions: data as CohortSessionRecord[] };
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
