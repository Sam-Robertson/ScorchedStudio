-- Run this in the Supabase SQL editor.
--
-- Gives group events a location, the same way bookings got one in
-- supabase-locations-setup.sql. Existing events default to Orem, which is
-- where all of them happened. The admin events page filters on it and the
-- event form sets it.
--
-- Safe to re-run.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'orem'
  CHECK (location IN ('orem', 'slc'));

CREATE INDEX IF NOT EXISTS events_location_date_idx ON events (location, date);
