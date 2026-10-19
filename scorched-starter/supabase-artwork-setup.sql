-- Run this in the Supabase SQL editor.
--
-- Artwork on loan from local artists: who lent it, how long the studio has
-- it, what it sells for, a photo, and the terms of the agreement. Admin only
-- (app/admin/artwork); nothing here is shown on the public site.

CREATE TABLE IF NOT EXISTS artwork_leases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  artist_name        TEXT NOT NULL,
  artist_email       TEXT,
  artist_phone       TEXT,
  medium             TEXT,                 -- e.g. "Oil on canvas"
  dimensions         TEXT,                 -- free text, e.g. 24" x 36"
  location           TEXT NOT NULL DEFAULT 'orem' CHECK (location IN ('orem', 'slc')),
  lease_start        DATE NOT NULL,
  lease_end          DATE,                 -- null: open-ended
  sale_price_cents   INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),  -- null: not for sale
  commission_percent NUMERIC(5,2) CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100)),  -- studio's cut of a sale
  status             TEXT NOT NULL DEFAULT 'on_display' CHECK (status IN ('on_display', 'returned', 'sold')),
  image_url          TEXT,
  image_path         TEXT,
  agreement_notes    TEXT,                 -- insurance, who hangs it, how it is returned, anything else agreed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artwork_leases_status_idx ON artwork_leases (status, lease_end);

-- Public bucket for the photos, like social-media and marketing-media. The
-- browser uploads straight to it through a signed URL from
-- app/api/admin/artwork/[id]/image/sign, so the app server never holds the
-- file bytes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artwork-images',
  'artwork-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
