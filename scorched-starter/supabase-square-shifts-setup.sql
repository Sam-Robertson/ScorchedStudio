-- Run this in the Supabase SQL editor to set up the tables used by the
-- admin employee schedule (app/admin/schedule), synced from Square's Labor
-- API ScheduledShift objects (not the deprecated Shift endpoints).

CREATE TABLE IF NOT EXISTS staff (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  square_team_member_id  text        NOT NULL UNIQUE,
  name                   text        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_shifts (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  square_shift_id        text        NOT NULL UNIQUE,
  square_location_id     text        NOT NULL,
  square_team_member_id  text        NOT NULL,
  job_title              text,
  start_at               timestamptz NOT NULL,
  end_at                 timestamptz,
  notes                  text,
  status                 text        NOT NULL CHECK (status IN ('draft', 'published')),
  is_deleted             boolean     NOT NULL DEFAULT false,
  raw_payload            jsonb,
  synced_at              timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_shifts_location_id_idx ON schedule_shifts (square_location_id);
CREATE INDEX IF NOT EXISTS schedule_shifts_team_member_id_idx ON schedule_shifts (square_team_member_id);
CREATE INDEX IF NOT EXISTS schedule_shifts_start_at_idx ON schedule_shifts (start_at);
