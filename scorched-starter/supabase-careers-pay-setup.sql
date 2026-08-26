-- Run this in the Supabase SQL editor to add a pay field to job openings.
-- Free text like location/employment_type (e.g. "$15-18/hr", "$45k-55k/yr")
-- since pay is expressed differently across role types.
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS pay TEXT;
