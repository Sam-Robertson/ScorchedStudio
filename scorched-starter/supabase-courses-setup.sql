-- Run this in the Supabase SQL editor to set up the Courses feature —
-- cohort-based multi-week course products, distinct from open drop-in
-- session booking. Depends on supabase-locations-setup.sql (course_cohorts
-- references locations(key)).

-- courses: the reusable course definition. Editable without code — price,
-- capacity, and curriculum all live on this row (and its cohorts).
CREATE TABLE IF NOT EXISTS courses (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  slug                        TEXT NOT NULL UNIQUE,
  description                 TEXT NOT NULL,
  curriculum                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_price_cents         INT NOT NULL,
  default_capacity            INT NOT NULL,
  -- Template values used to pre-fill a new cohort's price/capacity and to
  -- seed session_count sessions of session_duration_minutes each when an
  -- admin creates a cohort — not a constraint on course_sessions itself.
  session_count               INT NOT NULL,
  session_duration_minutes    INT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_slug_idx ON courses (slug);

-- course_cohorts: one scheduled run of a course.
CREATE TABLE IF NOT EXISTS course_cohorts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  location      TEXT NOT NULL REFERENCES locations(key),
  price_cents   INT NOT NULL,   -- defaults from courses.default_price_cents at creation, overridable
  capacity      INT NOT NULL,   -- defaults from courses.default_capacity at creation, overridable
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_cohorts_course_id_idx ON course_cohorts (course_id);

-- course_sessions: individual meetings within a cohort.
-- session_date/start_time/end_time are local studio wall-clock values (DATE
-- + TIME, same as business_hours) — this is what "anchored to America/Denver"
-- means in this codebase's existing convention. There's no UTC conversion to
-- do since the studio doesn't move timezones.
CREATE TABLE IF NOT EXISTS course_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       UUID NOT NULL REFERENCES course_cohorts(id) ON DELETE CASCADE,
  session_number  INT NOT NULL,
  session_date    DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, session_number)
);

CREATE INDEX IF NOT EXISTS course_sessions_cohort_id_idx ON course_sessions (cohort_id);

-- course_enrollments: a paid seat.
CREATE TABLE IF NOT EXISTS course_enrollments (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id                     UUID NOT NULL REFERENCES course_cohorts(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  email                         TEXT NOT NULL,
  phone                         TEXT,
  -- Checkout Session id is the idempotency key (a retried webhook delivery
  -- for the same session must not create a second seat) — same role
  -- stripe_subscription_id plays for memberships. Payment Intent id is
  -- stored separately because refunds (app/api/courses/manage) take a
  -- PaymentIntent/charge id, not a Checkout Session id.
  stripe_checkout_session_id    TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id      TEXT,
  amount_paid_cents             INT NOT NULL,
  status                        TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'refunded')),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_enrollments_cohort_id_idx ON course_enrollments (cohort_id);

-- course_waitlist: interest recorded when a cohort is full, or a customer
-- bumped by the oversell-refund fallback in the webhook. Staff convert a
-- waitlist entry by clicking "Notify next" (emails a checkout link for the
-- cohort) — this does not reserve a seat; whoever completes checkout first
-- wins via enroll_in_cohort, which already handles concurrent claims safely.
CREATE TABLE IF NOT EXISTS course_waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id    UUID NOT NULL REFERENCES course_cohorts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'enrolled', 'declined')),
  notified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_waitlist_cohort_id_idx ON course_waitlist (cohort_id);

-- Seats remaining, derived — never a mutable counter. The public
-- availability API route selects only these aggregate columns, so raw
-- enrollment rows (names/emails) never reach the client.
CREATE OR REPLACE VIEW course_cohort_availability AS
SELECT
  c.id AS cohort_id,
  c.capacity,
  COUNT(e.id) FILTER (WHERE e.status = 'confirmed') AS confirmed_count,
  c.capacity - COUNT(e.id) FILTER (WHERE e.status = 'confirmed') AS seats_remaining,
  (c.capacity - COUNT(e.id) FILTER (WHERE e.status = 'confirmed')) <= 0 AS is_full
FROM course_cohorts c
LEFT JOIN course_enrollments e ON e.cohort_id = c.id
GROUP BY c.id, c.capacity;

-- Atomic "enroll if a seat is available," called from the webhook after
-- payment succeeds. Modeled directly on redeem_membership_entitlement
-- (supabase-membership-redemptions-setup.sql).
CREATE OR REPLACE FUNCTION enroll_in_cohort(
  p_cohort_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_stripe_checkout_session_id TEXT,
  p_stripe_payment_intent_id TEXT,
  p_amount_paid_cents INT
) RETURNS course_enrollments
LANGUAGE plpgsql
AS $$
DECLARE
  result course_enrollments;
BEGIN
  -- Idempotent: a retried webhook delivery for the same Checkout Session
  -- returns the row the first delivery already created, instead of
  -- re-running the capacity check (which would otherwise see the cohort as
  -- full because of the very row this call is retrying).
  SELECT * INTO result FROM course_enrollments
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  IF FOUND THEN
    RETURN result;
  END IF;

  -- Lock the cohort row so two concurrent enrollments for the last seat
  -- can't both pass the capacity check below — an INSERT-based capacity
  -- check needs this explicitly, unlike redeem_membership_entitlement's
  -- single UPDATE, which gets the equivalent row lock for free.
  PERFORM 1 FROM course_cohorts WHERE id = p_cohort_id FOR UPDATE;

  INSERT INTO course_enrollments (
    cohort_id, name, email, phone,
    stripe_checkout_session_id, stripe_payment_intent_id,
    amount_paid_cents, status
  )
  SELECT
    p_cohort_id, p_name, p_email, p_phone,
    p_stripe_checkout_session_id, p_stripe_payment_intent_id,
    p_amount_paid_cents, 'confirmed'
  WHERE (
    SELECT c.capacity - COUNT(e.id) FILTER (WHERE e.status = 'confirmed')
    FROM course_cohorts c
    LEFT JOIN course_enrollments e ON e.cohort_id = c.id
    WHERE c.id = p_cohort_id
    GROUP BY c.capacity
  ) > 0
  RETURNING * INTO result;

  -- Zero rows matched the WHERE clause (cohort full): return SQL NULL, not
  -- an all-NULL row — same PostgREST truthiness trap documented in
  -- redeem_membership_entitlement.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN result;
END;
$$;

-- Seed: Pyrography 101, two cohorts at Orem.
INSERT INTO courses (name, slug, description, curriculum, default_price_cents, default_capacity, session_count, session_duration_minutes, status)
VALUES (
  'Pyrography 101',
  'pyrography-101',
  'A 4-week introduction to woodburning — from tool control to a finished, sealed project.',
  '[
    {"week": 1, "title": "Foundations and control", "topics": ["Tools, tips, and wood types", "Safety", "Heat control", "Grain and prep", "Control drills", "Start practice board"]},
    {"week": 2, "title": "Shading, texture, and value", "topics": ["Gradients", "Texture techniques", "Tip selection", "Finish practice board as a value study"]},
    {"week": 3, "title": "Composition and project start", "topics": ["Design transfer", "Composition basics", "Burn order", "Begin main project"]},
    {"week": 4, "title": "Detail, finishing, and seal", "topics": ["Detail passes", "Depth and contrast", "Fixing mistakes", "Sealing and finishing", "Complete project"]}
  ]'::jsonb,
  13500, 10, 4, 120, 'active'
)
ON CONFLICT (slug) DO NOTHING;

WITH c AS (SELECT id FROM courses WHERE slug = 'pyrography-101'),
     wanted(new_label) AS (VALUES ('Tuesday'), ('Thursday'))
INSERT INTO course_cohorts (course_id, label, location, price_cents, capacity, status)
SELECT c.id, wanted.new_label, 'orem', 13500, 10, 'open'
FROM c CROSS JOIN wanted
WHERE NOT EXISTS (
  SELECT 1 FROM course_cohorts cc
  WHERE cc.course_id = c.id AND cc.label = wanted.new_label
);

WITH cohort_a AS (
  SELECT cc.id FROM course_cohorts cc JOIN courses c ON c.id = cc.course_id
  WHERE c.slug = 'pyrography-101' AND cc.label = 'Tuesday'
),
-- Explicit casts matter here: UNION'd text literals with no other type
-- context resolve to `text`, not the target column's type, so plain
-- '2026-09-29' fails to insert into a DATE column without them.
sessions_a(session_number, session_date, start_time, end_time) AS (
  VALUES
    (1, '2026-09-29'::date, '18:00'::time, '20:00'::time),
    (2, '2026-10-06'::date, '18:00'::time, '20:00'::time),
    (3, '2026-10-13'::date, '18:00'::time, '20:00'::time),
    (4, '2026-10-20'::date, '18:00'::time, '20:00'::time)
)
INSERT INTO course_sessions (cohort_id, session_number, session_date, start_time, end_time)
SELECT cohort_a.id, sessions_a.session_number, sessions_a.session_date, sessions_a.start_time, sessions_a.end_time
FROM cohort_a CROSS JOIN sessions_a
ON CONFLICT (cohort_id, session_number) DO NOTHING;

WITH cohort_b AS (
  SELECT cc.id FROM course_cohorts cc JOIN courses c ON c.id = cc.course_id
  WHERE c.slug = 'pyrography-101' AND cc.label = 'Thursday'
),
sessions_b(session_number, session_date, start_time, end_time) AS (
  VALUES
    (1, '2026-10-01'::date, '18:00'::time, '20:00'::time),
    (2, '2026-10-08'::date, '18:00'::time, '20:00'::time),
    (3, '2026-10-15'::date, '18:00'::time, '20:00'::time),
    (4, '2026-10-22'::date, '18:00'::time, '20:00'::time)
)
INSERT INTO course_sessions (cohort_id, session_number, session_date, start_time, end_time)
SELECT cohort_b.id, sessions_b.session_number, sessions_b.session_date, sessions_b.start_time, sessions_b.end_time
FROM cohort_b CROSS JOIN sessions_b
ON CONFLICT (cohort_id, session_number) DO NOTHING;
