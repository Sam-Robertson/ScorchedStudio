-- Job openings, shown on /careers, managed from /admin/careers.
CREATE TABLE IF NOT EXISTS job_openings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  -- Free text, not an FK to `locations` — a posting can span both studios or be remote.
  location        TEXT,
  employment_type TEXT,
  description     TEXT        NOT NULL,
  is_published    BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marketing email capture from the site footer.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
