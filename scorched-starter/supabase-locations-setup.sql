-- Run this in the Supabase SQL editor to set up multi-location support:
-- a locations table (used for location-tier admin login + public booking
-- availability/capacity), and a `location` column on every table that the
-- "In Studio" admin section touches. Every existing row genuinely was
-- created at Orem (this app was single-location until now), so defaulting
-- the new column to 'orem' is a correct backfill, not a placeholder.

CREATE TABLE IF NOT EXISTS locations (
  key             TEXT        PRIMARY KEY CHECK (key IN ('orem', 'slc')),
  name            TEXT        NOT NULL,
  -- NULL until an admin sets a password from /admin/locations — a location
  -- with no password set simply can't log in yet.
  password_hash   TEXT,
  password_salt   TEXT,
  -- Whether this location shows up as a choice on the public booking page.
  -- SLC starts false; flip it on once the location actually opens.
  is_bookable     BOOLEAN     NOT NULL DEFAULT false,
  capacity        INT         NOT NULL DEFAULT 20,
  max_party_size  INT         NOT NULL DEFAULT 15,
  address         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO locations (key, name, is_bookable, capacity, max_party_size, address) VALUES
  ('orem', 'Orem', true, 20, 15, '218 E University Pkwy, Orem, UT 84058'),
  ('slc', 'Salt Lake City', false, 20, 15, NULL)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE bookings           ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc'));
ALTER TABLE waivers            ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc'));
ALTER TABLE print_jobs         ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc'));
ALTER TABLE equipment_reports  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc'));

CREATE INDEX IF NOT EXISTS bookings_location_idx          ON bookings (location);
CREATE INDEX IF NOT EXISTS waivers_location_idx           ON waivers (location);
CREATE INDEX IF NOT EXISTS print_jobs_location_idx        ON print_jobs (location);
CREATE INDEX IF NOT EXISTS equipment_reports_location_idx ON equipment_reports (location);

-- business_hours moves from one row per weekday to one row per
-- (location, weekday), so Orem and SLC can eventually run different hours.
-- Existing rows are re-keyed as Orem's hours; SLC gets no rows until an
-- admin sets them from /admin/locations.
ALTER TABLE business_hours DROP CONSTRAINT IF EXISTS business_hours_pkey;
ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc'));
ALTER TABLE business_hours ADD PRIMARY KEY (location, weekday);
