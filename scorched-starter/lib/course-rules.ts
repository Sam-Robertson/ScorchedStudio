// lib/course-rules.ts
//
// Course rules that the checkout and waitlist routes, the course page, and the
// tests all need to agree on. Pure functions with no "@/" imports, so client
// components can import it and the project's test runner can drive it.
import { todayInDenverYmd } from "./timezone.ts";

type DatedSession = { session_date: string }; // "YYYY-MM-DD", studio-local

// The day a cohort starts: its earliest session date, whatever that session is
// numbered. Null when nothing is scheduled yet.
export function cohortFirstSessionDate(sessions: DatedSession[]): string | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((min, s) => (s.session_date < min ? s.session_date : min), sessions[0].session_date);
}

export function cohortLastSessionDate(sessions: DatedSession[]): string | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((max, s) => (s.session_date > max ? s.session_date : max), sessions[0].session_date);
}

// "open":    the first session date has not passed, sign-ups are allowed.
// "started": the first session date has passed and sessions are still running.
// "ended":   the last session date has passed too.
export type CohortEnrollmentWindow = "open" | "started" | "ended";

// Sign-ups close once the first session's date has passed in Denver. A cohort
// starting Sep 29 can still be joined all day on the 29th, and is closed from
// Sep 30 on. The comparison is on the Denver calendar date, not the UTC one,
// which is already "tomorrow" during the studio's evening. A cohort with no
// sessions has no first date to pass, so it stays open.
export function cohortEnrollmentWindow(sessions: DatedSession[], now: Date = new Date()): CohortEnrollmentWindow {
  const first = cohortFirstSessionDate(sessions);
  const last = cohortLastSessionDate(sessions);
  if (!first || !last) return "open";

  const today = todayInDenverYmd(now);
  if (today <= first) return "open";
  return today > last ? "ended" : "started";
}
