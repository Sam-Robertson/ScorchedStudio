-- Run this in the Supabase SQL editor to set up the comment_reactions table,
-- which lets a board participant leave a quick emoji reaction (default 👍)
-- on a comment to acknowledge they've seen it. Depends on the comments table
-- from supabase-comments-setup.sql.

CREATE TABLE IF NOT EXISTS comment_reactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  author      text        NOT NULL,
  emoji       text        NOT NULL DEFAULT '👍',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, author, emoji)
);

CREATE INDEX IF NOT EXISTS comment_reactions_comment_id_idx ON comment_reactions (comment_id);
