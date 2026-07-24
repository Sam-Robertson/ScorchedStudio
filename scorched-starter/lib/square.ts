// lib/square.ts — server-only, never import in client components
//
// Thin wrapper around the Square Labor and Team REST APIs. Uses the
// ScheduledShift endpoints (not the deprecated /v2/labor/shifts/... Shift
// endpoints). Field names below match Square's wire format (snake_case),
// confirmed against Square's own SDK source, not guessed from docs.

const SQUARE_VERSION = "2026-01-22";

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

async function squareFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("Missing SQUARE_ACCESS_TOKEN");

  const res = await fetch(`${squareBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`SQUARE_API_ERROR ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body as T;
}

export type SquareScheduledShiftDetails = {
  team_member_id?: string | null;
  location_id?: string | null;
  job_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  notes?: string | null;
  is_deleted?: boolean | null;
  timezone?: string;
};

export type SquareScheduledShift = {
  id?: string;
  draft_shift_details?: SquareScheduledShiftDetails;
  published_shift_details?: SquareScheduledShiftDetails;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

export type SquareTeamMember = {
  id?: string;
  given_name?: string | null;
  family_name?: string | null;
  status?: string;
};

export type SquareJob = {
  id?: string;
  title?: string | null;
};

export async function searchScheduledShifts(params: {
  locationIds: string[];
  startDate: string;
  endDate: string;
  defaultTimezone: string;
  cursor?: string;
}): Promise<{ scheduledShifts: SquareScheduledShift[]; cursor?: string }> {
  const data = await squareFetch<{
    scheduled_shifts?: SquareScheduledShift[];
    cursor?: string;
  }>("/v2/labor/scheduled-shifts/search", {
    method: "POST",
    body: JSON.stringify({
      query: {
        filter: {
          location_ids: params.locationIds,
          workday: {
            date_range: { start_date: params.startDate, end_date: params.endDate },
            match_scheduled_shifts_by: "INTERSECTION",
            default_timezone: params.defaultTimezone,
          },
        },
        sort: { field: "START_AT", order: "ASC" },
      },
      limit: 50,
      cursor: params.cursor,
    }),
  });

  return { scheduledShifts: data.scheduled_shifts ?? [], cursor: data.cursor };
}

export async function retrieveScheduledShift(id: string): Promise<SquareScheduledShift | null> {
  const data = await squareFetch<{ scheduled_shift?: SquareScheduledShift }>(
    `/v2/labor/scheduled-shifts/${encodeURIComponent(id)}`,
    { method: "GET" }
  );
  return data.scheduled_shift ?? null;
}

export async function searchTeamMembers(
  cursor?: string
): Promise<{ teamMembers: SquareTeamMember[]; cursor?: string }> {
  const data = await squareFetch<{
    team_members?: SquareTeamMember[];
    cursor?: string;
  }>("/v2/team-members/search", {
    method: "POST",
    body: JSON.stringify({
      query: { filter: { status: "ACTIVE" } },
      limit: 100,
      cursor,
    }),
  });

  return { teamMembers: data.team_members ?? [], cursor: data.cursor };
}

export async function listJobs(cursor?: string): Promise<{ jobs: SquareJob[]; cursor?: string }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const data = await squareFetch<{ jobs?: SquareJob[]; cursor?: string }>(
    `/v2/team-members/jobs${query}`,
    { method: "GET" }
  );

  return { jobs: data.jobs ?? [], cursor: data.cursor };
}
