-- Run this in the Supabase SQL editor to add job-posting templates,
-- reusable starting points for the admin "New Opening" form. Separate
-- from job_openings since a template isn't a real posting and should
-- never show up on the public /careers page.
CREATE TABLE IF NOT EXISTS job_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  location        TEXT,
  employment_type TEXT,
  pay             TEXT,
  description     TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
