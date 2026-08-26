-- Adds a public-facing phone number per location, shown on /locations.
-- Orem's number matches the one already used on /contact and in booking/waiver emails.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone TEXT;

UPDATE locations SET phone = '(801) 361-9066' WHERE key = 'orem' AND phone IS NULL;
