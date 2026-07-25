-- Run this in the Supabase SQL editor to set up the comments table used by
-- the Operations board (app/admin/projects) and Social Media board
-- (app/admin/social). Replaces the old approach of appending comment text
-- directly onto tasks.notes / social_posts.notes.

CREATE TABLE IF NOT EXISTS comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board       text        NOT NULL CHECK (board IN ('operations', 'social')),
  entity_id   uuid        NOT NULL,
  author      text        NOT NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_entity_id_idx ON comments (entity_id);
