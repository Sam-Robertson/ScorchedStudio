-- Run this in the Supabase SQL editor (paste as a single line).
--
-- Holiday hours. A blocked_dates row with no times still closes the date for
-- booking. A row with open_time and close_time opens that date with those
-- hours instead of the weekday's usual ones, even on a day that is normally
-- closed. Applies to every location, like blocked dates always have.
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS open_time time, ADD COLUMN IF NOT EXISTS close_time time, ADD CONSTRAINT blocked_dates_hours_pair CHECK ((open_time IS NULL AND close_time IS NULL) OR (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time));
