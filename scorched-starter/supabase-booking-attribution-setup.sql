-- Paid-ad attribution on bookings.
--
-- The booking form sends the campaign parameters the browser last arrived
-- with (utm_* from an ad link, or a platform click id such as fbclid), and
-- the booking row keeps them so cost per booking can count bookings an ad
-- actually brought, not every booking. Shape and the "is this paid" rule live
-- in lib/attribution.ts. All nullable; NULL means the visit carried no
-- campaign parameters (organic, direct, or booked before this was added).
--
-- The app writes these columns in a separate update after the insert and only
-- logs when it fails, so bookings keep working until this has been run.
--
-- Run once in the Supabase SQL editor.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS utm_source    TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS utm_medium    TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS utm_campaign  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS utm_content   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS click_id_kind TEXT;   -- meta | tiktok | google | microsoft
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS landing_path  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;

-- Check:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'bookings' AND column_name LIKE 'utm_%';
