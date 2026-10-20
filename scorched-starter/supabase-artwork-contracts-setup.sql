-- Run this in the Supabase SQL editor (each statement is one line so it pastes cleanly).
--
-- Adds the signed artist agreement to artwork_leases. Contracts hold personal
-- details, so the bucket is private and the admin page reads them through
-- short-lived signed URLs from app/api/admin/artwork.

ALTER TABLE artwork_leases ADD COLUMN IF NOT EXISTS contract_path TEXT, ADD COLUMN IF NOT EXISTS contract_name TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('artwork-contracts', 'artwork-contracts', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
