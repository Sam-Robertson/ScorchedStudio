-- Run this in the Supabase SQL editor to set up the print job queue tables.

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  width_in    NUMERIC(6,2) NOT NULL,
  height_in   NUMERIC(6,2) NOT NULL,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Print jobs table
CREATE TABLE IF NOT EXISTS print_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  image_base64  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at    TIMESTAMPTZ
);

-- Seed default products
INSERT INTO products (name, width_in, height_in, notes, active) VALUES
  ('Cutting Board', 8.0,  9.0,  NULL, true),
  ('Disk',          4.5,  4.5,  'Round product — design is square-cropped and engraved as a circle', true),
  ('Journal',       5.0,  7.0,  NULL, true)
ON CONFLICT DO NOTHING;
