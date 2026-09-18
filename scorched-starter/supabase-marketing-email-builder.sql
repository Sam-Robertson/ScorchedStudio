-- supabase-marketing-email-builder.sql
--
-- Adds the block-based email builder to the existing marketing schema.
--
-- Additive only. Nothing here drops or rewrites a column, and every existing
-- campaign keeps working: a row with blocks IS NULL still renders through the
-- old markdown path, so drafts written before the builder are untouched.
--
-- Apply with:
--   Supabase dashboard -> SQL Editor -> paste this file -> Run
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Campaign content
-- ---------------------------------------------------------------------------

-- The block document. NULL means "this campaign predates the builder", which
-- is what the renderer checks to decide between the block path and markdown.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS blocks JSONB;

-- Global styling for the block document: colors, font, content width. Kept
-- separate from blocks so a design change never has to walk the block array.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS design JSONB;

-- The snippet shown after the subject line in an inbox list. Its own column
-- because it is neither content nor styling, and leaving it empty lets clients
-- scrape the first line of the body instead, which usually looks like an
-- accident.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS preview_text TEXT;

-- Note on campaigns.body: it stays NOT NULL and keeps holding text. For block
-- campaigns it is the generated plain-text version, which the multipart send
-- needs anyway. So the constraint is satisfied by something useful rather than
-- by a placeholder, and a block campaign still reads sensibly in a SQL client.

-- ---------------------------------------------------------------------------
-- 2. Templates
-- ---------------------------------------------------------------------------

-- Its own table rather than a flag on campaigns. A template living in
-- campaigns would show up in the campaign list, in the scheduler's "due" scan,
-- and in every audience count query, and each of those would need a WHERE
-- clause that someone would eventually forget.
CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  preview_text TEXT,
  blocks JSONB NOT NULL,
  design JSONB,
  -- Seeded rows ship with the app and are re-seeded by this migration.
  -- Anything an admin saves is is_builtin = false and is never overwritten.
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_templates_sort_idx
  ON campaign_templates (sort_order, name);

ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
-- No policies, matching the rest of the marketing schema: every read and write
-- goes through the service role in a server route that has already checked the
-- admin session. An anon key gets nothing.

-- Reuses the shared updated_at trigger function the marketing setup created.
DROP TRIGGER IF EXISTS campaign_templates_touch ON campaign_templates;
CREATE TRIGGER campaign_templates_touch
  BEFORE UPDATE ON campaign_templates
  FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Image storage
-- ---------------------------------------------------------------------------

-- Public bucket. Email clients fetch images with no cookies and no auth
-- header, so a signed or private URL simply renders as a broken image; the
-- only workable options are a public bucket or CID attachments, and
-- attachments hurt deliverability.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-media',
  'marketing-media',
  true,
  10485760, -- 10 MB, before the server resize
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A public bucket already serves reads through the public object endpoint,
-- which is what an email client fetches, so no policy is needed for this to
-- work. Writes stay with the service role, which is the upload route after it
-- has checked the admin session and re-encoded the file.
--
-- An explicit SELECT policy is offered at the bottom of this file instead of
-- here: creating one requires ownership of storage.objects, which the
-- dashboard SQL Editor does not always have, and a failure mid-script would
-- roll back the column changes above along with it.

-- ---------------------------------------------------------------------------
-- 4. Seed the built-in templates
-- ---------------------------------------------------------------------------
-- Idempotent: re-running refreshes the built-ins in place and leaves any
-- admin-saved template alone.

INSERT INTO campaign_templates (slug, name, description, subject, preview_text, blocks, design, is_builtin, sort_order)
VALUES
  (
    'blank',
    'Blank',
    'An empty canvas with just a heading and a paragraph.',
    '',
    '',
    '[
      {"id":"t-blank-1","type":"heading","text":"Your headline here","level":1,"align":"left"},
      {"id":"t-blank-2","type":"text","html":"<p>Write your message here.</p>"}
    ]'::jsonb,
    NULL,
    true,
    10
  ),
  (
    'class-announcement',
    'Class announcement',
    'Image, details, and a book-now button. For a new class or workshop date.',
    'New class: {{class_name}}',
    'Seats are limited, so grab one while they last.',
    '[
      {"id":"t-class-1","type":"image","src":"","alt":"","width":"full","href":""},
      {"id":"t-class-2","type":"heading","text":"A new class just opened up","level":1,"align":"left"},
      {"id":"t-class-3","type":"text","html":"<p>Hi {{first_name}}, we just added a new date to the calendar. Here is what you need to know.</p>"},
      {"id":"t-class-4","type":"card","title":"Class name","body":"A sentence about what you will make and who it is for.","meta":"Saturday, 2:00pm  ·  2 hours  ·  $65","imageSrc":"","buttonLabel":"Book a seat","buttonHref":"https://scorchedstudio.com/book"},
      {"id":"t-class-5","type":"divider"},
      {"id":"t-class-6","type":"text","html":"<p>Questions? Just reply to this email and we will get back to you.</p>"}
    ]'::jsonb,
    NULL,
    true,
    20
  ),
  (
    'monthly-newsletter',
    'Monthly newsletter',
    'A greeting, two or three story blocks, and a sign-off.',
    'What is happening at the studio this month',
    'New classes, a studio update, and something we made.',
    '[
      {"id":"t-news-1","type":"heading","text":"This month at the studio","level":1,"align":"left"},
      {"id":"t-news-2","type":"text","html":"<p>Hi {{first_name}}, here is what we have been up to and what is coming next.</p>"},
      {"id":"t-news-3","type":"divider"},
      {"id":"t-news-4","type":"columns","imageSrc":"","imageAlt":"","title":"Something we made","body":"A short paragraph about a recent piece, a student project, or a technique.","href":"","imagePosition":"left"},
      {"id":"t-news-5","type":"spacer","size":"md"},
      {"id":"t-news-6","type":"columns","imageSrc":"","imageAlt":"","title":"Coming up","body":"A short paragraph about the next class, event, or open studio night.","href":"","imagePosition":"right"},
      {"id":"t-news-7","type":"divider"},
      {"id":"t-news-8","type":"button","label":"See the full calendar","href":"https://scorchedstudio.com/book","align":"center"},
      {"id":"t-news-9","type":"text","html":"<p>See you soon,<br>The Scorched Studio team</p>"}
    ]'::jsonb,
    NULL,
    true,
    30
  )
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      subject = EXCLUDED.subject,
      preview_text = EXCLUDED.preview_text,
      blocks = EXCLUDED.blocks,
      design = EXCLUDED.design,
      sort_order = EXCLUDED.sort_order,
      updated_at = now()
  WHERE campaign_templates.is_builtin;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'campaigns' AND column_name IN ('blocks','design','preview_text');
-- SELECT slug, name, is_builtin FROM campaign_templates ORDER BY sort_order;
-- SELECT id, public FROM storage.buckets WHERE id = 'marketing-media';

-- ---------------------------------------------------------------------------
-- 5. Optional: an explicit read policy on the bucket
-- ---------------------------------------------------------------------------
-- Not needed. A public bucket already serves its objects over the public
-- endpoint, which is how an email client fetches an image.
--
-- Run this separately, on its own, only if you later make the bucket private
-- and need a policy to open reads back up. It is kept out of the main script
-- because CREATE POLICY on storage.objects needs ownership of a table owned by
-- supabase_storage_admin, and a failure here would roll back everything above.
--
--   DROP POLICY IF EXISTS "marketing media public read" ON storage.objects;
--   CREATE POLICY "marketing media public read"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'marketing-media');
