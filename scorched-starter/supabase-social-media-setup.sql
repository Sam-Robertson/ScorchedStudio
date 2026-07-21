-- Run this in the Supabase SQL editor to create the storage bucket used by
-- the social media board for post attachments (app/api/admin/social-posts/[id]/media/route.ts).
--
-- This bucket was never provisioned, which is why every media upload on the
-- social board has been failing (regardless of file size or type).
--
-- file_size_limit is capped at 50 MB (52428800 bytes) — this project's plan
-- rejects a larger per-bucket limit. Videos over ~50 MB will still fail;
-- raise the plan's storage limits first if that becomes a real constraint.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-media',
  'social-media',
  true,
  52428800, -- 50 MB
  ARRAY['image/*', 'video/*']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/*', 'video/*'];
