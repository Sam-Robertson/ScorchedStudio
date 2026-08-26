-- Rough expected-opening date shown on a location's "Coming Soon" page,
-- e.g. "October 2026". Free text, not a real date — admins won't always
-- have an exact day, and forcing one would look more precise than it is.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS opening_estimate TEXT;

UPDATE locations SET opening_estimate = 'October 2026' WHERE key = 'slc' AND opening_estimate IS NULL;
