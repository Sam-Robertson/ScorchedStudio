-- Each studio gets its own inbox. Contact-form messages and job applications
-- are routed to the chosen studio's address; CONTACT_TO stays the fallback
-- for anything that has no location (or a location with no email set).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE locations SET email = 'orem@scorchedstudio.com' WHERE key = 'orem' AND email IS NULL;
UPDATE locations SET email = 'slc@scorchedstudio.com'  WHERE key = 'slc'  AND email IS NULL;
