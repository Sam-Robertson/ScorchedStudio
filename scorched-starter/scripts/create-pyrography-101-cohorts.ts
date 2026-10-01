// scripts/create-pyrography-101-cohorts.ts
//
// Adds the next four runs of Pyrography 101 (a Tuesday and a Thursday cohort
// each, November 2026 through March 2027), approved by Sam on October 1, 2026.
//
// Each cohort is made with duplicateCohort, the same function behind the admin
// Duplicate button, so location, price, capacity, session times, and the
// week-to-week spacing are copied from the existing "Tuesday" and "Thursday"
// cohorts rather than retyped here.
//
// No cohort has a session in the weeks of Thanksgiving, Christmas, or New
// Year's. Only three clear weeks sit between Thanksgiving and Christmas, which
// a four-week cohort does not fit, so there is no December run.
//
//   pnpm tsx scripts/create-pyrography-101-cohorts.ts            (dry run)
//   pnpm tsx scripts/create-pyrography-101-cohorts.ts --apply
//
// Dry run is the default because the only credentials on this machine are
// production. Safe to re-run: a label that already exists is skipped.
import { loadEnv } from "./load-env.ts";

loadEnv();

import { duplicateCohort, getCohortsForCourse, getCourseBySlug, getSessionsForCohort } from "../lib/courses.ts";

const COURSE_SLUG = "pyrography-101";

const PLAN: Array<{ label: string; copyFrom: "Tuesday" | "Thursday"; firstSession: string }> = [
  { label: "November Tuesdays", copyFrom: "Tuesday", firstSession: "2026-10-27" },
  { label: "November Thursdays", copyFrom: "Thursday", firstSession: "2026-10-29" },
  { label: "January Tuesdays", copyFrom: "Tuesday", firstSession: "2027-01-05" },
  { label: "January Thursdays", copyFrom: "Thursday", firstSession: "2027-01-07" },
  { label: "February Tuesdays", copyFrom: "Tuesday", firstSession: "2027-02-02" },
  { label: "February Thursdays", copyFrom: "Thursday", firstSession: "2027-02-04" },
  { label: "March Tuesdays", copyFrom: "Tuesday", firstSession: "2027-03-02" },
  { label: "March Thursdays", copyFrom: "Thursday", firstSession: "2027-03-04" },
];

// Monday of each week no session may fall in.
const HOLIDAY_WEEKS: Array<{ monday: string; name: string }> = [
  { monday: "2026-11-23", name: "Thanksgiving" },
  { monday: "2026-12-21", name: "Christmas" },
  { monday: "2026-12-28", name: "New Year's" },
];

const apply = process.argv.includes("--apply");

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(date: string): string {
  return utc(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function holidayFor(date: string): string | null {
  const hit = HOLIDAY_WEEKS.find((w) => date >= w.monday && date <= addDays(w.monday, 6));
  return hit ? hit.name : null;
}

async function main() {
  const course = await getCourseBySlug(COURSE_SLUG);
  if (!course) throw new Error(`Course ${COURSE_SLUG} not found.`);

  const cohorts = await getCohortsForCourse(course.id);
  const existingLabels = new Set(cohorts.map((c) => c.label));

  console.log(apply ? "APPLYING to the database.\n" : "Dry run. Nothing will be written. Pass --apply to create these.\n");

  // Work out and check every date before creating anything, so a bad plan
  // fails whole instead of leaving half the cohorts behind.
  const steps = [];
  for (const item of PLAN) {
    const source = cohorts.find((c) => c.label === item.copyFrom);
    if (!source) throw new Error(`Source cohort "${item.copyFrom}" not found.`);

    const sessions = await getSessionsForCohort(source.id);
    if (sessions.length === 0) throw new Error(`Source cohort "${item.copyFrom}" has no sessions.`);

    const earliest = sessions.reduce((min, s) => (s.session_date < min ? s.session_date : min), sessions[0].session_date);
    if (weekday(earliest) !== weekday(item.firstSession)) {
      throw new Error(`${item.label}: ${item.firstSession} is a ${weekday(item.firstSession)}, but "${item.copyFrom}" meets on ${weekday(earliest)}.`);
    }

    const shift = Math.round((utc(item.firstSession).getTime() - utc(earliest).getTime()) / 86_400_000);
    const dates = sessions.map((s) => addDays(s.session_date, shift));
    for (const date of dates) {
      const holiday = holidayFor(date);
      if (holiday) throw new Error(`${item.label}: ${date} falls in ${holiday} week.`);
    }

    steps.push({ ...item, source, dates, times: `${sessions[0].start_time}-${sessions[0].end_time}` });
  }

  for (const step of steps) {
    const summary = `${step.label.padEnd(20)} ${step.dates.map((d) => `${weekday(d)} ${d}`).join(", ")}  (${step.source.location}, $${(step.source.price_cents / 100).toFixed(2)}, capacity ${step.source.capacity}, ${step.times})`;

    if (existingLabels.has(step.label)) {
      console.log(`skip     ${summary}  [already exists]`);
      continue;
    }
    if (!apply) {
      console.log(`would add ${summary}`);
      continue;
    }

    const created = await duplicateCohort(step.source.id, { label: step.label, first_session_date: step.firstSession });
    const createdDates = created.sessions.map((s) => s.session_date);
    if (createdDates.join() !== step.dates.join()) {
      throw new Error(`${step.label}: created ${createdDates.join(", ")} but expected ${step.dates.join(", ")}. Stopping.`);
    }
    console.log(`created  ${summary}  [${created.cohort.id}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
